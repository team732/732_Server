import Promise from 'bluebird';
import _ from 'underscore';
import camelCase from 'camelcase';
import db from './db';
import fs from 'fs';
import AWS from 'aws-sdk';
import dateFormat from 'dateformat';
import mime from 'mime-types';
import awsConfig from '../server/config/aws-config.json';
import FCM from 'fcm-node';
// import schedule from 'node-schedule';

let serverKey = 'AAAA3gUQUFM:APA91bGtp04LvA2YFRhqUuvU63L0G8uYkig7pMUDYAFp8tzmOR1XBVHfP2z7884I5hhtTdXrZiszIKq63ZwP6qCJk_WhJjThOxvcIA2bEhAmIdzDATPPdiboPvscSefkoRJT7M7dCZ_P';
let fcm = new FCM(serverKey);

let config = new AWS.Config(
    {
        accessKeyId       : awsConfig.accessKeyId,
        secretAccessKey   : awsConfig.secretAccessKey,
        region            : awsConfig.region
    }
);

let s3 = new AWS.S3(config);

export const sendFCM = ( title, body, data, registrationIds ) => {

    let registraionIdsSplitArr = [];

    while (registrationIds.length > 0) {
        registraionIdsSplitArr.push(registrationIds.splice(0, 800));
    }

    let message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
        registration_ids: [],
        collapse_key: Date(),

        notification: {
            title: title,
            body: body,
            sound: "default"
        },

        data: data
    };

    Promise.each(registraionIdsSplitArr, (registraionIdsArr, key) => {
        message.registration_ids = registraionIdsArr;
        // console.log(message);
        return sendFCMPromise(message).then((result) => {
            console.log(result);
        });
    });

    // fcm.send(message, (err, response) => {
    //     if ( err ) {
    //         console.log("Something has gone wrong!", err);
    //     } else {
    //         console.log("Successfully sent with response: ", response);
    //     }
    // });
}

const sendFCMPromise = (message) => {
    return new Promise((resolved, rejected) => {
        fcm.send(message, (err, response) => {
            if ( err ) {
                console.log("Something has gone wrong!", err);
                rejected(err);
            } else {
                // console.log("Successfully sent with response: ", response);
                resolved(response);
            }
        });
        // connection.query(queryString, queryValueArr, (err, result) => {
        //     if (err) {
        //         console.log(err);
        //         connection.release();
        //         return connection.rollback(() => {
        //             res.status(500).json(DB_ERROR);
        //         });
        //     } else {
        //         resolved(result);
        //     }
        // });
    });
};

// let rule = new schedule.RecurrenceRule();
// rule.minute = 1;
//매 시간 30분 마다 수행

// let adasdasd = schedule.scheduleJob('0 * * * * *', () => {
//     console.log('...보냈다!');
//     db.pool.getConnection((connectionErr, connection) => {
//         if (connectionErr) {
//             connection.release();
//         } else {
//             connection.query(`
//                 SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%c월 %e일") AS mission_date
//                 FROM mission_tbl
//                 WHERE mission_tbl.mission_date <= DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
//                 ORDER BY mission_tbl.mission_date DESC
//                 LIMIT 1`, (err, missionResult) => {
//                 if (err) {
//                     console.log(err);
//                     connection.release();
//                 } else {
//                     let mission = JSON.parse(missionResult[0].mission);
//                     sendFCM( `${missionResult[0].mission_date} 오늘의 잠상 만나는 봤나?(진지진지)\n${mission.text}`, {}, {} );
//                 }
//             });
//         }
//     });
// });

export const DB_ERROR = {
                            meta: {
                                code: -11,
                                message: "데이터베이스 오류"
                            }
                        };

export const SERVER_ERROR = {
                            meta: {
                                code: -12,
                                message: "서버 오류"
                            }
                        };

export const SUCCESS =  {
                            meta: {
                                code: 0,
                                message: "success"
                            }
                        };

export const INVALID_REQUEST =  {
                                    meta: {
                                        code: -10,
                                        message: "잘못된 요청입니다."
                                    }
                                };

export const resultArray = {
    toCamelCase : (body, data, pagination) => {

        return toCamelCase(
            Object.assign(
                {},
                body,
                data && {data:data},
                pagination && {pagination : {nextUrl : pagination}}
            )
        , 0);
    }
}

export const UPLOAD_TYPES = [ "image/jpeg", "image/gif", "image/png", "image/jpg" ];

export const LOGIN_ID_REGEXP = /^(?=.*[a-zA-Z])(?=.*[0-9])[a-zA-Z0-9]{6,16}$/;
export const EMAIL_REGEXP = /^[0-9a-zA-Z]([\-.\w]*[0-9a-zA-Z\-_+])*@([0-9a-zA-Z][\-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,20}$/;
export const PASSWORD_REGEXP = /^[A-Za-z0-9]{6,16}$/;
// export const PASSWORD_REGEXP = /^(?=.*[a-z])(?=.*[0-9]).{6,16}$/;
// export const PASSWORD_REGEXP = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*+=-])(?=.*[0-9]).{6,16}$/;

export const LOGIN_EXPIRY_TIME = "720h";
// export const LOGIN_EXPIRY_TIME = "1m";
// export const ADMIN_LOGIN_EXPIRY_TIME = "120h";
export const ADMIN_LOGIN_EXPIRY_TIME = "720h";

export const MISSION_TYPES = {
    1: "text"
}


export const isSet = (object, field) => {
    return _.has(object, field) ? (object[field].length > 1 ? object[field] : object[field][0]) : undefined;
}

export const IS_MY_ID = (paramId, tokenId) => {
    if(paramId === "me"){
        return tokenId;
    } else {
        return paramId;
    }
};

export const query = (connection, res, queryString, queryValueArr = null) => {
    return new Promise((resolved, rejected) => {
        connection.query(queryString, queryValueArr, (err, result) => {
            if (err) {
                console.log(err);
                connection.release();
                return connection.rollback(() => {
                    res.status(500).json(DB_ERROR);
                });
            } else {
                resolved(result);
            }
        });
    });
};

export const dbConnect = (res) => {
    return new Promise((resolved, rejected) => {
        db.pool.getConnection((connectionErr, connection) => {
            if (connectionErr) {
                console.log(connectionErr);
                connection.release();
                return res.status(500).json(DB_ERROR);
            } else {
                resolved(connection);
            }
        });
    });
};

export const query2 = (connection, queryString, queryValueArr = null) => {
    return new Promise((resolved, rejected) => {
        connection.query(queryString, queryValueArr, (err, result) => {
            if (err) {
                console.log(err);
                connection.release();
            } else {
                resolved(result);
            }
        });
    });
};

export const dbConnect2 = () => {
    return new Promise((resolved, rejected) => {
        db.pool.getConnection((connectionErr, connection) => {
            if (connectionErr) {
                connection.release();
            } else {
                resolved(connection);
            }
        });
    });
};

export const toCamelCase = (params, index) => {
    // console.log(params);
    if ( _.isArray(params) ) { // params가 Array일 때
        return params.map((row) => (_.isObject(row) || _.isArray(row)) ? toCamelCase(row, index) : row);
    } else if ( _.isDate(params) ){
        return params;
    } else if ( _.isObject(params) ) { // params가 Object일 때
        return _.object(_.keys(params).map((key)=>camelCase(key)), _.values(params).map((value)=>toCamelCase(value, index)));
    } else if( isJsonString(params) ) {
        // return params;
        return toCamelCase(JSON.parse(params));
    } else { // params가 Array, Obejct, json이 아닐 때
        return params;
    }
};

export const isJsonString = (str) => {
    if ( _.isNumber(str) || _.isArray(str) || _.isObject(str) || _.isDate(str) || _.isNull(str) || _.isUndefined(str) || _.isEmpty(str) ) {
        return false;
    }

    if ( _.isString(str) ) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    } else {
        return false;
    }
}

export const randomString = (length) => {
    var chars = "23456789ABCDEFGHJKLMNPQRSTUVWXTZabcdefghkmnopqrstuvwxyz";
    var randomstring = '';
    for (var i=0; i<length; i++) {
        var rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars.substring(rnum,rnum+1);
    }
    return randomstring;
}

export const defineTableOfContentsId = (elements, indexes = []) => {
    if ( _.isArray(elements) ) {
        return elements.map((row) => {
            if( _.isUndefined(row.id) ){
                let index;
                do {
                    index = _.random(0, 1000000000);
                }
                while(indexes.indexOf(index) !== -1);

                row.id = index;
                indexes.push(index);
            } else {
                indexes.push(row.id);
            }

            row.elements = defineTableOfContentsId(row.elements, indexes)
            return row;
        });
    } else if ( _.isObject(elements) ) {
        if( _.isUndefined(elements.id) ){
            let index;
            do {
                index = _.random(0, 1000000000);
            }
            while(indexes.indexOf(index) !== -1);

            elements.id = index;
            indexes.push(index);
        } else {
            indexes.push(elements.id);
        }

        if(elements.elements.length === 0){
            return elements;
        } else {
            elements.elements = defineTableOfContentsId(elements.elements, indexes);
            return elements;
        }
    } else {
        return elements;
    }
};


export const putObjectToS3 = (filePath, bucketName, s3RootFolder, callback = undefined) => {
    // if ( filePath === DEFAULT_GROUP_IMG || filePath === DEFAULT_ORGANIZAION_IMG || filePath === DEFAULT_USER_IMG ) {
    //     callback(filePath);
    //     return;
    // }

    fs.readFile(filePath, (readErr, data) => {
        if ( readErr ) {
            return callback(null, readErr);
        }



        if ( UPLOAD_TYPES.indexOf( mime.lookup( filePath ) ) === -1 ) {
            fs.unlink(filePath, (unlinkErr) => {
                return callback(null, resultArray.toCamelCase(
                        {
                            meta: {
                                code:"-21",
                                message:"이미지만 업로드 가능합니다."
                            }
                        }
                    )
                );
            });
        } else {

            let nameSplit = filePath.split(".");
            let type = nameSplit[nameSplit.length-1];

            let now = new Date();

            let newFilePath = `${s3RootFolder}/${dateFormat(now, 'HH:MM:ss')}-${parseInt(Math.random()*1000000000)}.${type}`;
            let params = {
                Bucket: bucketName,
                Key: newFilePath,
                Body: data,
                ACL: 'public-read'
            };

            s3.putObject(params, (putError, s3Data) => {
                if ( putError ) {// s3에 업로드 실패
                    console.log(putError)
                    return callback(null, putError);
                } else {
                    fs.unlink(filePath, (err) => {
                        let uploadPath = `https://s3.${awsConfig.region}.amazonaws.com/${bucketName}/${newFilePath}`;
                        callback(uploadPath);
                    });

                }
            });
        }
    });
};

/*
 * 날짜포맷에 맞는지 검사
 */
const isDateFormat = (d) => {
    var df = /[0-9]{4}-[0-9]{2}-[0-9]{2}/;
    return d.match(df);
}

/*
 * 윤년여부 검사
 */
const isLeaf = (year) => {
    var leaf = false;

    if(year % 4 == 0) {
        leaf = true;

        if(year % 100 == 0) {
            leaf = false;
        }

        if(year % 400 == 0) {
            leaf = true;
        }
    }

    return leaf;
}

/*
 * 날짜가 유효한지 검사
 */
export const isValidDate = (d) => {
    // 포맷에 안맞으면 false리턴
    if(!isDateFormat(d)) {
        return false;
    }

    var month_day = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    var dateToken = d.split('-');
    var year = Number(dateToken[0]);
    var month = Number(dateToken[1]);
    var day = Number(dateToken[2]);

    // 날짜가 0이면 false
    if(day == 0) {
        return false;
    }

    var isValid = false;

    // 윤년일때
    if(isLeaf(year)) {
        if(month == 2) {
            if(day <= month_day[month-1] + 1) {
                isValid = true;
            }
        } else {
            if(day <= month_day[month-1]) {
                isValid = true;
            }
        }
    } else {
        if(day <= month_day[month-1]) {
            isValid = true;
        }
    }

    return isValid;
}