const fs = require('fs-extra');
const dbConfig = require('../config/dbconfig');
const soapRequest = require('easy-soap-request');
const { transform } = require('camaro');
const logger = require('./logger');
const oracledb = require('oracledb');
const jsonxml = require('jsonxml');

oracledb.autoCommit = true;
process.env.ORA_SDTZ = 'UTC';

let xml, url, sampleHeaders, output, xmlreq, sessionID, connection;

// soap  request ID session 
 url = 'http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1';
 sampleHeaders = {
  'user-agent': 'sampleTest',
  'Content-Type': 'text/xml;charset=UTF-8',
  'soapAction':"function=Logon",
};

xml = fs.readFileSync('test/logon.xml', 'utf-8');

// usage of module
async function movement__ () {
  (async () => {
   let { response } = await soapRequest({ url: url, headers: sampleHeaders, xml: xml, timeout: 5000 }); // Optional timeout parameter(milliseconds)
   let { headers, body, statusCode } = response;
    console.log(headers);
    //console.log(body);
    console.log(statusCode);
    const template = ['soapenv:Envelope/soapenv:Body/localtypes:session', {
     SessionID: 'SessionID' ,
  }];
  output = await transform(body, template);
//console.log(output);

sessionID = (output[0].SessionID);
console.log(sessionID);

//request purchase order
url = 'http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1';
sampleHeaders = {
 'user-agent': 'sampleTest',
 'Content-Type': 'text/xml;charset=UTF-8',
 'soapAction':"service=Job_638_INFOR_to_MIGO_MBGM",
};

//oracledb query

try {
  let sql, binds, options, result;

  connection = await oracledb.getConnection(dbConfig);
  logger.transactionLog.log('info', 'succefull connection');

// Select
sql = `select tr.tra_desc HEADER_TXT,
TO_CHAR(tr.tra_created, 'YYYYMMDD') DOC_DATE,
TO_CHAR(tr.tra_updated, 'YYYYMMDD') PSTNG_DATE
from r5transactions tr
where tr.tra_code = 1051757`;

result = await connection.execute(sql, {}, { outFormat: oracledb.OBJECT });

console.log('RESULTSET:' + JSON.stringify(result));

let E1BP2017_GM_HEAD_01 = [];

E1BP2017_GM_HEAD_01 = result.rows.map((column) => ({
    "inp:E1BP2017_GM_HEAD_01": {
     "inp:PSTNG_DATE": "20221215",
      "inp:DOC_DATE": "20221215",
      "inp:HEADER_TXT": column.HEADER_TXT
    }

}));
console.log(E1BP2017_GM_HEAD_01);

let xmlHead= jsonxml(E1BP2017_GM_HEAD_01, options);

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
tl.trl_qty,
tl.trl_costcode,
tl.trl_bin,
tl.trl_sourcecode,
pa.par_code,
NVL(su.UOM_SAP, pa.par_uom) UNIDAD
from r5transactions tr, r5translines tl, r5parts pa, sap_planta sp, sap_mov sm, sap_cencos sc, sap_uom su
where 1 = 1
and tr.tra_code = 1051757
and tl.trl_trans = tr.tra_code
and tl.trl_part = pa.par_code
and sp.PLANTA_EAM = tr.TRA_FROMCODE
and sm.MOV_EAM = tl.trl_type
and sc.CENCOS_EAM (+)= tl.trl_costcode
and sc.PLANTA_EAM (+)= tl.trl_store
and tr.tra_status = 'A'
and TRL_UDFCHKBOX05 = '+'
and su.UOM_EAM (+)= pa.par_uom
--and tr.tra_created > (sysdate - 6)
and ROWNUM < 1000
order by tr.tra_code DESC`;


result = await connection.execute(sql, {}, { outFormat: oracledb.OBJECT });

console.log('RESULTSET:' + JSON.stringify(result));

let E1BP2017_GM_ITEM_CREATE = [];

E1BP2017_GM_ITEM_CREATE = result.rows.map((column) => ({
    "inp:E1BP2017_GM_ITEM_CREATE": {
      "inp:MATERIAL":column.TRL_PART,
      "inp:PLANT":column.PLANTA,
      "inp:STGE_LOC": column.STOR_LOC,
      "inp:MOVE_TYPE":column.COD_MOV,
      "inp:ENTRY_QNT":column.TRL_QTY,
      "inp:ENTRY_UOM": column.UNIDAD,
      "inp:COSTCENTER":column.CENCOS
    }

}));

console.log(E1BP2017_GM_ITEM_CREATE);

let xmlDetail= jsonxml(E1BP2017_GM_ITEM_CREATE, options)

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

 response  = await soapRequest({ url: url, headers: sampleHeaders, xml: xmlmov, timeout: 65000 }); // Optional timeout parameter(milliseconds)
 headers, body, statusCode = response;
//console.log(headers);
console.log(statusCode);
logger.transactionLog.log('info', statusCode);

//console.log(body);
//movement request and query (aca va todo transaction);

} catch (err) {
  console.error(err);
  logger.transactionLog.log('error', err);
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
};


module.exports =
{
    movement__:movement__
};
