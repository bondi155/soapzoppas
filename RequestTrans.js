const fs = require('fs-extra');
const soapRequest = require('easy-soap-request');

function transactionRequest (){
// example data
const url = 'http://10.0.23.50:8080/DataServices/servlet/webservices?ver=2.1';
const sampleHeaders = {
  'user-agent': 'sampleTest',
  'Content-Type': 'text/xml;charset=UTF-8',
  'soapAction':"function=Logon",
};

const xml = fs.readFileSync('test/logon.xml', 'utf-8');

// usage of module
(async () => {
  const { response } = await soapRequest({ url: url, headers: sampleHeaders, xml: xml, timeout: 5000 }); // Optional timeout parameter(milliseconds)
  const { headers, body, statusCode } = response;
  console.log(headers);
  console.log(body);
  console.log(statusCode);
})();


}

module.exports= {
    transactionRequest
}