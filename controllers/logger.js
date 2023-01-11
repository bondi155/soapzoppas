const {createLogger, transports, format, prettyPrint} = require('winston')
require('winston-daily-rotate-file');

const timezoned = () =>{

    return new Date().toLocaleString('en-US',
    {
        timeZone: 'America/Mexico_city'
    })
}


const transactionLog = createLogger({
    
   transports:[
    new transports.DailyRotateFile({ 

            filename: 'log/Mov-%DATE%.log',
            datePattern:'YYYY-MM-DD',
            level: 'info',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true,
            format: format.combine(format.timestamp({format: timezoned}), format.prettyPrint())

        }),
        new transports.DailyRotateFile({
            filename:'log/error-Mov-%DATE%.log',
            level:'error',
            maxSize: '20m',
            maxFiles: '14d',
            zippedArchive: true,
            datePattern: 'YYYY-MM-DD',
            format: format.combine(format.timestamp({format: timezoned}), format.prettyPrint())

        })
    ]
})

const requisitionLog = createLogger({
    
    transports:[
     new transports.DailyRotateFile({ 
 
             filename: 'log/Purch-%DATE%.log',
             datePattern:'YYYY-MM-DD',
             level: 'info',
             maxSize: '20m',
             maxFiles: '14d',
             zippedArchive: true,
             format: format.combine(format.timestamp({format: timezoned}), format.prettyPrint())
 
         }),
         new transports.DailyRotateFile({
             filename:'log/error-Purch-%DATE%.log',
             level:'error',
             maxSize: '20m',
             maxFiles: '14d',
             zippedArchive: true,
             datePattern: 'YYYY-MM-DD',
             format: format.combine(format.timestamp({format: timezoned}), format.prettyPrint())
 
         })
     ]
 })



//si no se quiere log diario con fecha en filename cambiar DailyRotateFile x file y quitar %DATE% de los titulos.

module.exports={
    transactionLog,
    requisitionLog
}