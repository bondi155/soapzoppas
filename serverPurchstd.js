const soapRequisitionstd = require('./controllerstd/soapReqstd');
//const soapMovement = require ('./controllers/soapMov');

/*
new Promise(function(resolve) {

  resolve(soapRequisition.requisition__());
  
  }).then(function(result) {
  
    soapMovement.movement__();
  
  })
  */
soapRequisitionstd.requisitionstd__();
//soapMovement.movement__();
