import mysql from 'mysql';
import dbConfig from '../server/config/db-config.json';

module.exports = {
    init : (name) => {
        return module.exports[name] = mysql.createPool({
            host                 : dbConfig.host,
            port                 : dbConfig.port,
            user                 : dbConfig.user,
            password             : dbConfig.password,
            database             : dbConfig.database,
            multipleStatements   : dbConfig.multipleStatements,
            connectionLimit      : dbConfig.connectionLimit,
            waitForConnections   : dbConfig.waitForConnections,
            charset              : dbConfig.charset
        });
    }
}