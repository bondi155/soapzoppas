const fs = require('fs-extra');
const dbConfig = require('../config/dbconfig');
const soapRequest = require('easy-soap-request');
const { transform } = require('camaro');
const logger = require('./logger');
const oracledb = require('oracledb');
const jsonxml = require('jsonxml');

//config oracle cliente
let libPath;
if (process.platform === 'win32') {
  // Windows
  libPath = 'C:\\oracle\\instantclient_12_2';
} else if (process.platform === 'darwin') {
  // macOS
  libPath = process.env.HOME + '/Downloads/instantclient_19_8';
}
if (libPath && fs.existsSync(libPath)) {
  oracledb.initOracleClient({ libDir: libPath });
}
// end config client

oracledb.autoCommit = true;
process.env.ORA_SDTZ = 'UTC';

let xml, url, sampleHeaders, output, xmlreq, sessionID, connection;


// usage of module
async function requisition__ () {
  
  // soap  request ID session 
 url = 'http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1';
 sampleHeaders = {
  'user-agent': 'sampleTest',
  'Content-Type': 'text/xml;charset=UTF-8',
  'soapAction':"function=Logon",
};

xml = fs.readFileSync('test/logon.xml', 'utf-8');

  (async () => {
   let { response } = await soapRequest({ url: url, headers: sampleHeaders, xml: xml, timeout: 5000 }); // Optional timeout parameter(milliseconds)
   let { headers, body, statusCode } = response;
    console.log(headers);
    //console.log(body);
    console.log(statusCode);
    //extraemos el session id del xml respuesta del logon
    const template = ['soapenv:Envelope/soapenv:Body/localtypes:session', {
     SessionID: 'SessionID' ,
  }];

  output = await transform(body, template);

sessionID = (output[0].SessionID);
console.log(sessionID);

//request purchase order
url = 'http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1';
sampleHeaders = {
 'user-agent': 'sampleTest',
 'Content-Type': 'text/xml;charset=UTF-8',
 'soapAction':"service=Job_639_INFOR_to_RDA_PREQ",
};

//oracledb query

try {
  let sql, binds, options, result;

  connection = await oracledb.getConnection(dbConfig);
  logger.transactionLog.log('info', 'succefull connection with database');
  

  //Select de parametro ID requisition
  sql =`SELECT a1.param id_a_proc
  FROM (select DISTINCT rq.req_code param, rq.req_date f_crea
 from r5requisitions rq, r5requislines rl, sap_planta sp, sap_mov sm, sap_uom su
 where rq.req_code = rl.rql_req
 and rq.req_status = 'A'
 and (rl.rql_udfchkbox05 = '-' or rl.rql_udfchkbox05 IS NULL)
 and sp.PLANTA_EAM = rq.REQ_TOCODE
 and sm.MOV_EAM = rq.req_type
 and su.UOM_EAM (+)= rl.rql_uom
 order by 2 DESC) a1
 where ROWNUM < 2`;

 result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

 let id_a_proc;

 for (const row of result.rows) {
  id_a_proc = row.ID_A_PROC;


 // Select
 sql =`select rq.req_code,
 rq.req_desc,
 rq.req_date,
 TO_CHAR(rq.req_date, 'YYYYMMDD') DELIV_DATE,
 TO_CHAR(rq.req_code)||LPAD(rl.rql_reqline ,2, '0') TRACK_NO,
 rq.req_status,
 sp.PLANTA_SAP PLANTA,
 sp.STORAGE_SAP STOR_LOC,
 sm.MOV_SAP COD_MOV,
 rq.req_fromentity,
 rq.req_type,
 rq.req_toentity,
 rq.req_tocode,
 rq.req_interface,
 rq.req_org,
 rq.req_interface,
 rq.req_udfchkbox05,
 rl.rql_type,
 rl.rql_req,
 rl.rql_reqline linea,
 rl.rql_part RQL_PART,
 rl.rql_part_org RQL_PART_ORG,
 abs (rl.rql_qty) QTY,
 NVL(su.UOM_SAP, rl.rql_uom) UOM,
 rl.rql_due
 from r5requisitions rq, r5requislines rl, sap_planta sp, sap_mov sm, sap_uom su
 where rq.req_code = rl.rql_req
 and rq.req_status = 'A'
 and (rl.rql_udfchkbox05 = '-' or rl.rql_udfchkbox05 IS NULL)
 and sp.PLANTA_EAM = rq.REQ_TOCODE
 and sm.MOV_EAM = rq.req_type
 and su.UOM_EAM (+)= rl.rql_uom
 and rq.req_code = :id_req
 and rl.rql_part not in ('58022510-M')
 order by rl.rql_reqline`;


 options = {
outFormat: oracledb.OBJECT

};

 //result = await connection.execute(sql, binds, options);
 //result = await connection.execute(sql, options, {param:{val: param, dir:oracledb.BIND_IN, type: oracledb.OBJECT}});

 result = await connection.execute(sql, {id_req: { dir: oracledb.BIND_IN, val: id_a_proc, type: oracledb.STRING }}, options);

 //result = await connection.execute(sql,{id_param: { dir: oracledb.BIND_IN, val: id_a_proc, type: oracledb.STRING }, id_param_lin: { dir: oracledb.BIND_IN, val: id_a_proc_lin, type: oracledb.STRING }}
//hacer update despues del estatus 200 acordarsze de ese pendiente
//hacer de nuevo el select 

  console.log('RESULTSET:' + JSON.stringify(result));

  let EDI_DC40 = [];

EDI_DC40 = result.rows.map((column) => ({
  "inp:E1BPEBANC": {
    "inp:DOC_TYPE": "NB",
    "inp:MATERIAL": column.RQL_PART,
    "inp:PLANT": column.PLANTA, //org
    "inp:STORE_LOC": column.STOR_LOC, //almacen de res o despacho.
    "inp:TRACKINGNO": column.TRACK_NO,
    "inp:QUANTITY": column.QTY,
    "inp:UNIT": column.UOM,
    "inp:DELIV_DATE": column.DELIV_DATE,   
  },
}));

console.log(EDI_DC40);
//logger.transactionLog.log('info', EDI_DC40);

let xml2 = jsonxml(EDI_DC40, options)

console.log(xml2);

xmlreq = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://www.businessobjects.com/DataServices/ServerX.xsd" xmlns:inp="http://businessobjects.com/service/SRV_IDOC_PREQ/input">
<soapenv:Header>
   <ser:session>
      <SessionID>${sessionID}</SessionID>
   </ser:session>
</soapenv:Header>
<soapenv:Body>
   <inp:PREQCR02>
      <inp:EDI_DC40>
      </inp:EDI_DC40>
      ${xml2}
   </inp:PREQCR02>
</soapenv:Body>
</soapenv:Envelope>`;

console.log(xmlreq);

 response  = await soapRequest({ url: url, headers: sampleHeaders, xml: xmlreq, timeout: 15000 }); // Optional timeout parameter(milliseconds)
 headers, body, statusCode = response;
console.log(statusCode);

//convertimos respuesta de type xml en variable
const template = ['soapenv:Envelope/soapenv:Body/response/messages/message', {
  type: 'type',
 
}]
const type = await transform(statusCode.response.body, template);
//console.log("esto es el type !!!!", type)

if(statusCode.response.statusCode === 200 && type != "E" ) {
  /*
  sql = `UPDATE r5requislines SET RQL_UDFCHKBOX05 = '+', 
  RQL_UDFDATE05 = sysdate WHERE rql_req = :id_param 
  and rql_reqline = :id_param_line`;
*/

sql = `UPDATE r5requislines SET RQL_UDFCHKBOX05 = '+', 
RQL_UDFDATE05 = sysdate WHERE rql_req = :id_param`;

  options = {
    outFormat: oracledb.OBJECT,
    autoCommit: true
  
    };

  result = await connection.execute(sql,{id_param: { dir: oracledb.BIND_IN, val: id_a_proc, 
    type: oracledb.STRING }}, options);

     //id_param_lin: { dir: oracledb.BIND_IN, val: id_a_proc_lin, type: oracledb.STRING }}, options)

 // console.log("el tipo es ", statusCode.response.statusCode)
} 
logger.transactionLog.log('info', statusCode);
//console.log(body);

//termina foreach para ejecutar cada id del 


};

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

module.exports = {
    requisition__:requisition__
  } 