const fs = require("fs-extra");
const dbConfig = require("../config/dbconfig");
const soapRequest = require("easy-soap-request");
const { transform } = require("camaro");
const logger = require("../controllers/logger");
const oracledb = require("oracledb");
const jsonxml = require("jsonxml");

oracledb.autoCommit = true;
oracledb.fetchAsString = [ oracledb.NUMBER ];
process.env.ORA_SDTZ = "UTC";

let xml, url, sampleHeaders, output, xmlreq, sessionID, connection;

// soap  request ID session
url = "http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1";
//url = "http://itzisapdtp21.zigroup.local:8080/DataServices/servlet/webservices?ver=2.1";
sampleHeaders = {
  "user-agent": "sampleTest",
  "Content-Type": "text/xml;charset=UTF-8",
  soapAction: "function=Logon",
};

xml = fs.readFileSync("test/logon.xml", "utf-8");

// MOVEMENT TRANS STANDAR
async function movementstd__() {
  (async () => {
    let { response } = await soapRequest({
      url: url,
      headers: sampleHeaders,
      xml: xml,
      timeout: 8000,
    }); // Optional timeout parameter(milliseconds)
    let { headers, body, statusCode } = response;
    //console.log(headers);
    //console.log(body);
 //   console.log(statusCode);
    const template = [
      "soapenv:Envelope/soapenv:Body/localtypes:session",
      {
        SessionID: "SessionID",
      },
    ];
    output = await transform(body, template);
    //console.log(output);

    sessionID = output[0].SessionID;
    //console.log(sessionID);

    //request movement
    url = "http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1";
    //url = "http://itzisapdtp21.zigroup.local:8080/DataServices/servlet/webservices?ver=2.1";
    sampleHeaders = {
      "user-agent": "sampleTest",
      "Content-Type": "text/xml;charset=UTF-8",
      soapAction: "service=Job_638_INFOR_to_MIGO_MBGM",
    };

    //oracledb query

    try {
      let sql, binds, options, result;

      connection = await oracledb.getConnection(dbConfig);
      logger.transactionLogstd.log("info", "succefull connection to oracle DB ");

      //select parametro movement transaction
      sql = `    SELECT a1.param id_a_proc
      FROM (select DISTINCT tr.tra_code param, tr.tra_created f_crea
      from r5transactions tr, r5translines tl, r5parts pa, 
      sap_planta sp, sap_mov sm, sap_cencos sc, sap_uom su
      where 1 = 1
      --and tr.tra_code IN (1052129)
      and tl.trl_trans = tr.tra_code
      and tl.trl_part = pa.par_code
      and sp.PLANTA_EAM = tr.TRA_FROMCODE
      and sm.MOV_EAM = tl.trl_type
      and DECODE(SIGN(tl.trl_qty), (-1), '-', '+') = sm.SIGNO
      and sc.CENCOS_EAM (+)= tl.trl_costcode
      and sc.PLANTA_EAM (+)= tl.trl_store
      and tr.tra_status = 'A'
      and (trl_udfchkbox05 = '-' or trl_udfchkbox05 IS NULL)
      and su.UOM_EAM (+)= pa.par_uom
      --AND (((tr.tra_type != 'I') AND (tra_fromentity = 'STOR' AND tra_toentity =  'STOR'))
      --OR (tra_fromentity <> 'STOR' OR tra_toentity <> 'STOR'))
      /*AND (((tra_fromentity = 'STOR' AND tra_toentity =  'STOR') AND (ENTRE_ALMACENES = 1))
      OR ((tra_fromentity <> 'STOR' OR tra_toentity <> 'STOR') AND (ENTRE_ALMACENES = 0 OR ENTRE_ALMACENES IS NULL)))*/
      --AND ((tra_fromentity = 'STOR' AND tra_toentity =  'STOR') AND (ENTRE_ALMACENES = 1))
      AND ((tra_fromentity <> 'STOR' OR tra_toentity <> 'STOR') AND (ENTRE_ALMACENES = 0 OR ENTRE_ALMACENES IS NULL))
      --and TRL_UDFDATE05 is NULL
      order by 2 DESC) a1
      WHERE ROWNUM < 2`;

      result = await connection.execute(sql, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      let id_a_proc;
      //console.log(id_a_proc);

      let primerCiclo = true;

      for (const row of result.rows) {
        id_a_proc = row.ID_A_PROC;

        // Select
        sql = `select SUBSTR(tr.tra_desc, 1, 25) HEADER_TXT ,
          TO_CHAR(tr.tra_created, 'YYYYMMDD') DOC_DATE,
          TO_CHAR(tr.tra_updated, 'YYYYMMDD') PSTNG_DATE,
          (CASE WHEN (tra_fromentity = 'STOR' AND tra_toentity =  'STOR') 
          THEN tra_req ELSE tra_code END) REF_MOV,
          (CASE WHEN (tra_fromentity = 'STOR' AND tra_toentity =  'STOR') 
          THEN  '03' ELSE '06' END) GM_CODE
          from r5transactions tr where tr.tra_code =:id_mov`;

        options = {
          outFormat: oracledb.OBJECT,
        };

        result = await connection.execute(
          sql,
          {
            id_mov: {
              dir: oracledb.BIND_IN,
              val: id_a_proc,
              type: oracledb.STRING,
            },
          },
          options
        );

        //result = await connection.execute(sql, {}, { outFormat: oracledb.OBJECT });

        // console.log("RESULTSET:" + JSON.stringify(result));

        let E1BP2017_GM_HEAD_01 = [];

        E1BP2017_GM_HEAD_01 = result.rows.map((column) => ({
          "inp:E1BP2017_GM_HEAD_01": {
            "inp:PSTNG_DATE": column.PSTNG_DATE,
            "inp:DOC_DATE": column.DOC_DATE,
            "inp:REF_DOC_NO":column.REF_MOV,
            "inp:HEADER_TXT": column.HEADER_TXT,
          },
          "inp:E1BP2017_GM_CODE": {
            "inp:GM_CODE": column.GM_CODE
          }
        }));

        console.log(E1BP2017_GM_HEAD_01);

        let xmlHead = jsonxml(E1BP2017_GM_HEAD_01, options);

        // console.log(xmlHead);

        sql = `select tr.tra_code,
        TO_CHAR (tr.tra_updated, 'YYYYMMDD') DELIV_DATE,
        sp.PLANTA_SAP PLANTA,
        sm.MOV_SAP COD_MOV,
        (CASE WHEN (tra_fromentity = 'STOR' AND tra_toentity =  'STOR') 
        THEN  ' ' ELSE NVL(sc.CENCOS_SAP, tl.trl_costcode) END) CENCOS,
        TO_CHAR(tr.tra_code)||LPAD(tl.trl_line,2, '0') TRACK_NO,
        tr.tra_type,
        tr.tra_org,
        tr.tra_status,
        tl.trl_trans,
        sp.STORAGE_SAP STOR_LOC,
        tl.trl_line,
        tl.trl_part,
        tl.trl_part_org,
        tl.trl_type,
        abs(tl.trl_qty) CANTIDAD,
        tl.trl_costcode,
        tl.trl_bin,
        tl.trl_sourcecode,
        pa.par_code,
        NVL(su.UOM_SAP, pa.par_uom) UNIDAD
        from r5transactions tr, r5translines tl, r5parts pa, sap_planta sp, sap_mov sm, sap_cencos sc, sap_uom su
        where 1 = 1
        and tr.tra_code = :id_mov
        and tl.trl_trans = tr.tra_code
        and tl.trl_part = pa.par_code
        and sp.PLANTA_EAM = tr.TRA_FROMCODE
        and sm.MOV_EAM = tl.trl_type
        and DECODE(SIGN(tl.trl_qty), (-1), '-', '+') = sm.SIGNO
        and sc.CENCOS_EAM (+)= tl.trl_costcode
        and sc.PLANTA_EAM (+)= tl.trl_store
        and tr.tra_status = 'A'
        and (trl_udfchkbox05 = '-' or trl_udfchkbox05 IS NULL)
        and su.UOM_EAM (+)= pa.par_uom
        AND ((tra_fromentity <> 'STOR' OR tra_toentity <> 'STOR') AND (ENTRE_ALMACENES = 0 OR ENTRE_ALMACENES IS NULL))
        order BY tl.trl_line`;

        options = {
          outFormat: oracledb.OBJECT,
        };

        result = await connection.execute(
          sql,
          {
            id_mov: {
              dir: oracledb.BIND_IN,
              val: id_a_proc,
              type: oracledb.STRING,
            },
          },
          options
        );

        //result = await connection.execute(sql, {}, { outFormat: oracledb.OBJECT });

        // console.log("RESULTSET:" + JSON.stringify(result));

        let E1BP2017_GM_ITEM_CREATE = [];

        E1BP2017_GM_ITEM_CREATE = result.rows.map((column) => ({
          "inp:E1BP2017_GM_ITEM_CREATE": {
            "inp:MATERIAL": column.TRL_PART,
            "inp:PLANT": column.PLANTA,
            "inp:STGE_LOC": column.STOR_LOC,
            "inp:MOVE_TYPE": column.COD_MOV,
            "inp:ENTRY_QNT": column.CANTIDAD,
            "inp:ENTRY_UOM": column.UNIDAD,
            "inp:COSTCENTER": column.CENCOS,
          },
        }));

        console.log(E1BP2017_GM_ITEM_CREATE);

        let xmlDetail = jsonxml(E1BP2017_GM_ITEM_CREATE, options);

        // console.log(xmlDetail);

        xmlmov = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://www.businessobjects.com/DataServices/ServerX.xsd" xmlns:inp="http://businessobjects.com/service/SRV_IDOC_MBGM/input">
        <soapenv:Header>
        <ser:session>
            <SessionID>${sessionID}</SessionID>
        </ser:session>
        </soapenv:Header>
        <soapenv:Body>
        <inp:MBGMCR03>
            <inp:EDI_DC40>
            </inp:EDI_DC40>
            <inp:E1MBGMCR>
            ${xmlHead}
            ${xmlDetail}
            </inp:E1MBGMCR>
        </inp:MBGMCR03>
        </soapenv:Body>
        </soapenv:Envelope>`;
        console.log(xmlmov);

        response = await soapRequest({
          url: url,
          headers: sampleHeaders,
          xml: xmlmov,
          timeout: 65000,
        }); // Optional timeout parameter(milliseconds)
        headers, body, statusCode = response;
        //console.log(headers);
        //console.log(statusCode.status);
        //console.log(body);

        logger.transactionLogstd.log("info", statusCode.response.body && statusCode.response.statusCode);

        //console.log(statusCode.response.statusCode);
        //convertimos respuesta de type xml en variable
        const template = ['soapenv:Envelope/soapenv:Body/response/messages/message', {
          type: 'type',
          content: 'content'
        }]

        const propiedades = await transform(statusCode.response.body, template);

        const tipo = (propiedades[0].type);
        const contErr = (propiedades[0].content);

        console.log(tipo);
        console.log(contErr);

         if (tipo === 'E') {

          sql = `UPDATE r5translines SET TRL_UDFCHAR05 = SUBSTR(:msg_err, 1, 80), TRL_UDFDATE05 = sysdate, TRL_UDFCHKBOX05 = 'E' WHERE trl_trans IN :id_param`;

          options = {
            outFormat: oracledb.OBJECT,
          };

          result = await connection.execute(
            sql,
            {
              msg_err: {
                dir: oracledb.BIND_IN,
                val: contErr,
                type: oracledb.STRING,
              },
              id_param: {
                dir: oracledb.BIND_IN,
                val: id_a_proc,
                type: oracledb.STRING,
              },
            },
            options
          );

        logger.transactionLogstd.log('error', `${contErr} Error, no procesado... Se marco con E en TRL_UDFCHKBOX05. ID tra : ${id_a_proc}.`);

        } else if (statusCode.response.statusCode === 200 && tipo != "E") {

          sql = `UPDATE r5translines SET TRL_UDFCHKBOX05 = '+', TRL_UDFCHAR30 = "STD",
           TRL_UDFDATE05 = sysdate, TRL_UDFCHAR05 = :msg_ok WHERE trl_trans IN :id_param `;
          //and trl_line = :id_param_line`;

          options = {
            outFormat: oracledb.OBJECT,
            autoCommit: true,
          };

          result = await connection.execute(
            sql,
            {
              id_param: {
                dir: oracledb.BIND_IN,
                val: id_a_proc,
                type: oracledb.STRING,
              },
              msg_ok: {
                dir: oracledb.BIND_IN,
                val: "Procesado Correctamente",
                type: oracledb.STRING,
              },
            },
            options
          );
          logger.transactionLogstd.log('info', `Procesado Correctamente. ID mov : ${id_a_proc} . ${contErr}`);


        }

       // console.log("\nEl id a proc es:", id_a_proc);
        primerCiclo = false;
      }
        //termina foreach para ejecutar cada id del

      if (primerCiclo === true) {
        console.log("no hay transactions codes para procesar")
      }

    } catch (err) {
      console.error(err);
      if (err.code === 'ERR_BAD_RESPONSE') {
        logger.transactionLogstd.log("error", err.response.data)
      } else {
        logger.transactionLogstd.log("error", err.message)
      }

    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error(err);
        }
      }
    }
  })();
}

module.exports = {
  movementstd__: movementstd__,
};
