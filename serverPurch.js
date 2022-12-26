const soapRequisition = require('./controllers/soapReq');
//const soapMovement = require ('./controllers/soapMov');

/*
new Promise(function(resolve) {

  resolve(soapRequisition.requisition__());
  
  }).then(function(result) {
  
    soapMovement.movement__();
  
  })
  */
soapRequisition.requisition__();
//soapMovement.movement__();
