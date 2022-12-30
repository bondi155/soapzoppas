const fs = require("fs-extra");
const dbConfig = require("../config/dbconfig");
const soapRequest = require("easy-soap-request");
const { transform } = require("camaro");
const logger = require("./logger");
const oracledb = require("oracledb");
const jsonxml = require("jsonxml");

oracledb.autoCommit = true;
process.env.ORA_SDTZ = "UTC";

let xml, url, sampleHeaders, output, xmlreq, sessionID, connection;

// soap  request ID session
url = "http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1";
sampleHeaders = {
  "user-agent": "sampleTest",
  "Content-Type": "text/xml;charset=UTF-8",
  soapAction: "function=Logon",
};

xml = fs.readFileSync("test/logon.xml", "utf-8");

// usage of module
async function movement__() {
  (async () => {
    let { response } = await soapRequest({
      url: url,
      headers: sampleHeaders,
      xml: xml,
      timeout: 5000,
    }); // Optional timeout parameter(milliseconds)
    let { headers, body, statusCode } = response;
    console.log(headers);
    //console.log(body);
    console.log(statusCode);
    const template = [
      "soapenv:Envelope/soapenv:Body/localtypes:session",
      {
        SessionID: "SessionID",
      },
    ];
    output = await transform(body, template);
    //console.log(output);

    sessionID = output[0].SessionID;
    console.log(sessionID);

    //request purchase order
    url = "http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1";
    sampleHeaders = {
      "user-agent": "sampleTest",
      "Content-Type": "text/xml;charset=UTF-8",
      soapAction: "service=Job_638_INFOR_to_MIGO_MBGM",
    };

    //oracledb query

    try {
      let sql, binds, options, result;

      connection = await oracledb.getConnection(dbConfig);
      logger.transactionLog.log("info", "succefull connection");

      //select parametro movement
      sql = `SELECT a1.param id_a_proc
      FROM (select DISTINCT tr.tra_code param, tr.tra_created f_crea
     from r5transactions tr, r5translines tl, r5parts pa, 
     sap_planta sp, sap_mov sm, sap_cencos sc, sap_uom su
     where 1 = 1
     and tl.trl_trans = tr.tra_code
     and tl.trl_part = pa.par_code
     and sp.PLANTA_EAM = tr.TRA_FROMCODE
     and sm.MOV_EAM = tl.trl_type
     and sc.CENCOS_EAM (+)= tl.trl_costcode
     and sc.PLANTA_EAM (+)= tl.trl_store
     and tr.tra_status = 'A'
     and (trl_udfchkbox05 = '-' or trl_udfchkbox05 IS NULL)
     and su.UOM_EAM (+)= pa.par_uom
     --and tr.tra_created > (sysdate - 6)
     order by 2 DESC) a1
     WHERE ROWNUM < 2`;

      result = await connection.execute(sql, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      let id_a_proc;

      for (const row of result.rows) {
        id_a_proc = row.ID_A_PROC;

        // Select
        sql = `select tr.tra_desc HEADER_TXT,
TO_CHAR(tr.tra_created, 'YYYYMMDD') DOC_DATE,
TO_CHAR(tr.tra_updated, 'YYYYMMDD') PSTNG_DATE
from r5transactions tr
where tr.tra_code = :id_mov`;

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

        console.log("RESULTSET:" + JSON.stringify(result));

        let E1BP2017_GM_HEAD_01 = [];

        E1BP2017_GM_HEAD_01 = result.rows.map((column) => ({
          "inp:E1BP2017_GM_HEAD_01": {
            "inp:PSTNG_DATE": "20221215",
            "inp:DOC_DATE": "20221215",
            "inp:HEADER_TXT": column.HEADER_TXT,
          },
        }));
        console.log(E1BP2017_GM_HEAD_01);

        let xmlHead = jsonxml(E1BP2017_GM_HEAD_01, options);

        console.log(xmlHead);

        // Select
        sql = `select tr.tra_code,
TO_CHAR (tr.tra_updated, 'YYYYMMDD') DELIV_DATE,
sp.PLANTA_SAP PLANTA,
sm.MOV_SAP COD_MOV,
NVL(sc.CENCOS_SAP, tl.trl_costcode) CENCOS,
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
and sc.CENCOS_EAM (+)= tl.trl_costcode
and sc.PLANTA_EAM (+)= tl.trl_store
and tr.tra_status = 'A'
and (trl_udfchkbox05 = '-' or trl_udfchkbox05 IS NULL)
and su.UOM_EAM (+)= pa.par_uom
order by tl.trl_line`;

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

        //reesult = await connection.execute(sql, {}, { outFormat: oracledb.OBJECT });

        console.log("RESULTSET:" + JSON.stringify(result));

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

        console.log(xmlDetail);

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
       <inp:E1BP2017_GM_CODE>
          <inp:GM_CODE>03</inp:GM_CODE>
       </inp:E1BP2017_GM_CODE>
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
        headers, body, (statusCode = response);
        //console.log(headers);
        console.log(statusCode);
        logger.transactionLog.log("info", statusCode);
        //console.log(body);

        //convertimos respuesta de type xml en variable
const template = ['soapenv:Envelope/soapenv:Body/response/messages/message', {
  type: 'type',
 
}]
const type = await transform(statusCode.response.body, template);


        if (statusCode.response.statusCode === 200 && type != "E" ) {
          sql = `UPDATE r5translines SET TRL_UDFCHKBOX05 = '+',
           TRL_UDFDATE05 = sysdate WHERE trl_trans IN :id_param `;
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
              }/*
              id_param_lin: {
                dir: oracledb.BIND_IN,
                val: id_a_proc_lin,
                type: oracledb.STRING,
              },*/
            },
            options
          );
        }

        //termina foreach para ejecutar cada id del

        console.log("\nEl id a proc es:", id_a_proc);
      }
    } catch (err) {
      console.error(err);
      logger.transactionLog.log("error", err);
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
  movement__: movement__,
};
