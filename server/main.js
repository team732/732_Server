import express from 'express';
import WebpackDevServer from 'webpack-dev-server';
import webpack from 'webpack';
import db from './db';
import path from 'path';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import nodemailer from 'nodemailer';
import schedule from 'node-schedule';
import _ from 'underscore';
import { dbConnect, query, dbConnect2, query2, resultArray, randomString, SUCCESS, INVALID_REQUEST, SERVER_ERROR, EMAIL_REGEXP, LOGIN_ID_REGEXP, LOGIN_EXPIRY_TIME, sendFCM } from './utils';

// import fs from 'fs';
// import https from 'https';
// import clientCertificateAuth from 'client-certificate-auth';

export const TOKEN_KEY = "GlP+*2`Wql:Pwa&(#@KJ(DI@Nksj";
export const ADMIN_TOKEN_KEY = "AsODI*)(280Hn+++0+=KJSmwl98&";
export const SALT_ROUNDS = 10;

let pool = db.init('pool');

const app = express();
const port = 6339;
const devPort = 3001;

app.set('views', __dirname + '/../views');
app.set('view engine', 'ejs');

if(process.env.NODE_ENV == 'development') {
    console.log('Server is running on development mode');

    const config = require('../webpack.dev.config');
    let compiler = webpack(config);
    let devServer = new WebpackDevServer(compiler, config.devServer);
    devServer.listen(devPort, () => {
        console.log('webpack-dev-server is listening on port', devPort);
    });
}

// app.use('/v1', clientCertificateAuth(checkAuth));
// app.use(function(err, req, res, next) {
//     if(err){
//         console.log(req.headers);
//         console.log(err);
//         return res.status(401).json(err);
//     } else {
//         next();
//     }
// });

app.use(cors());

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({limit: '10mb', extended: false, parameterLimit: 100000}));

app.use('/', express.static(__dirname + '/../public'));

let adminAuthorizationId = (req, res, next) => {
    let splitURLs = (req.baseUrl + req.path).split('/');

    req.currentUrl = `${req.protocol}://${req.get('host') + (req.path.length === 1 ? req.baseUrl : req.baseUrl + req.path)}`;
    // console.log(splitURLs);
    if ( splitURLs[2] === "users" ) {
        next();
    } else {
        let authorization = req.headers.authorization;
        if(typeof(authorization) === "undefined"){
            return res.status(401).json(
                resultArray.toCamelCase(
                    {
                        meta: {
                            code: -1,
                            message: "로그인 해주세요."
                        }
                    }
                )
            );
        } else {
            dbConnect(res).then((connection) => {
                query(connection, res, `SELECT * FROM invalid_token_tbl WHERE invalid_token = ?`, [authorization])
                .then((selectResult) => {
                    connection.release();

                    if(selectResult.length === 0){
                        try{
                            let decoded = jwt.verify(authorization, ADMIN_TOKEN_KEY);
                            // console.log(decoded);
                            req.authorizationId = decoded.userId;
                            req.name = decoded.name;
                            next();
                        } catch(err) {
                            // console.log(err);
                            return res.status(401).json(
                                resultArray.toCamelCase(
                                    {
                                        meta: {
                                            code: -2,
                                            message: "로그인 해주세요."
                                        }
                                    }
                                )
                            );
                        }
                    } else {
                        return res.status(401).json(
                            resultArray.toCamelCase(
                                {
                                    meta: {
                                        code: -4,
                                        message: "로그인 해주세요."
                                    }
                                }
                            )
                        );
                    }
                });
            });
        }
    }
};

let authorizationId = (req, res, next) => {
    let splitURLs = (req.baseUrl + req.path).split('/');

    // let regex = /^[v][0-9]{1,100}|^dev/;

    // if (!regex.test(splitURLs[1])) {
    //     return res.status(404).json(
    //         resultArray.toCamelCase(
    //             {
    //                 meta: {
    //                     code: 501,
    //                     message: "잘못된 접근입니다."
    //                 }
    //             }
    //         )
    //     );
    // }

    req.currentUrl = `${req.protocol}://${req.get('host') + (req.path.length === 1 ? req.baseUrl : req.baseUrl + req.path)}`;

    if((splitURLs[1] === "users" && (( (splitURLs[2] === "" || splitURLs[2] === undefined ) && req.method === "POST") || splitURLs[3] === "token")) ||  splitURLs[1] === "password-reset" || splitURLs[1] === "email" || splitURLs[1] === "nickname" || splitURLs[1] === "id" ) {
        next();
    } else {
        let authorization = req.headers.authorization;
        if(typeof(authorization) === "undefined"){
            return res.status(401).json(
                resultArray.toCamelCase(
                    {
                        meta: {
                            code: -1,
                            message: "로그인 해주세요."
                        }
                    }
                )
            );
        } else {
            dbConnect(res).then((connection) => {
                query(connection, res, `SELECT * FROM invalid_token_tbl WHERE invalid_token = ?`, [authorization])
                .then((selectResult) => {
                    connection.release();

                    if(selectResult.length === 0){
                        try{
                            let decoded = jwt.verify(authorization, TOKEN_KEY);
                            req.authorizationId = decoded.userId;

                            next();
                        } catch(err) {
                            // console.log(err);
                            return res.status(401).json(
                                resultArray.toCamelCase(
                                    {
                                        meta: {
                                            code: -2,
                                            message: "로그인 해주세요."
                                        }
                                    }
                                )
                            );
                        }
                    } else {
                        return res.status(401).json(
                            resultArray.toCamelCase(
                                {
                                    meta: {
                                        code: -4,
                                        message: "로그인 해주세요."
                                    }
                                }
                            )
                        );
                    }
                });
            });
        }
    }
};

// app.use('/dev', authorizationId);
// app.use('/', authorizationId);

// import rooms from './routes/v1/rooms';
// app.use('/v1/rooms', rooms);

app.use('/users', authorizationId);
import users from './routes/v1/users.js';
app.use('/users', users);

app.use('/contents', authorizationId);
import contents from './routes/v1/contents.js';
app.use('/contents', contents);

app.use('/missions', authorizationId);
import missions from './routes/v1/missions.js';
app.use('/missions', missions);

// 사용자 토큰 갱신
app.use('/token', authorizationId);
import token from './routes/v1/token.js';
app.use('/token',token);

//////////////////////////////////////////////////////////////

app.use('/admin/missions', adminAuthorizationId);
import adminMissions from './routes/v1/admin/missions.js';
app.use('/admin/missions', adminMissions);

app.use('/admin/users', adminAuthorizationId);
import adminUsers from './routes/v1/admin/users.js';
app.use('/admin/users', adminUsers);

// Admin 토큰 갱신
app.use('/admin/token', adminAuthorizationId);
import adminToken from './routes/v1/admin/token.js';
app.use('/admin/token', adminToken);

app.use('/password-reset', authorizationId);
app.post('/password-reset', (req, res) => {
    let email = req.body.email;

    if ( email === undefined || !EMAIL_REGEXP.test(email)) {
        return res.status(400).json(
            resultArray.toCamelCase(
                {
                    meta: {
                        code: -27,
                        message: "이메일을 바르게 입력해주세요."
                    }
                }
            )
        );
    }

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id, password FROM user_tbl WHERE email = ? AND deleted_at IS NULL`, [email])
        .then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `INSERT INTO password_reset_log_tbl(user_id)
                    VALUES(?)`, [result[0].user_id])
                .then((resetLogResult) => {
                    let smtpTransport = nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            user: '732team@gmail.com',
                            pass: 'clftkadl1231'
                        }
                    });

                    let mailOptions = {
                        from: '"732team" <732team@gmail.com>',
                        to: email,
                        subject: '732 비밀번호 초기화',
                        // text: '평문 보내기 테스트 '
                        html:`<p>메일 수신 후 5분 이내에 <a href="${req.currentUrl}?id=${resetLogResult.insertId}">여기</a>를 누르면 새로운 비밀번호가 메일로 전달됩니다.</p>`
                    };

                    smtpTransport.sendMail(mailOptions, (error, response) => {
                        smtpTransport.close();
                        connection.release();
                        if ( error ) {
                            console.log(error);
                            return res.status(500).json(SERVER_ERROR);
                        }

                        return res.status(200).json(resultArray.toCamelCase(SUCCESS));

                    });
                });
            }
        });
    });
});

app.get('/password-reset', (req, res) => {
    let id = req.query.id;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT t1.user_id, t2.email
            FROM password_reset_log_tbl AS t1
            INNER JOIN user_tbl AS t2
            ON t1.user_id = t2.user_id
            WHERE t1.is_reset = FALSE
            AND t1.created_at = t1.updated_at
            AND t1.created_at <= DATE_ADD(NOW(), INTERVAL 5 MINUTE)
            AND t1.password_reset_log_id = ?`, [id])
        .then((result) => {
            if( result.length !== 1 ) {
                // return res.status(500).json(SERVER_ERROR);
                // 브라우저에 표시해줘야함.
                connection.release();
                return res.send(`<script type="text/javascript">alert("사용할 수 없는 링크입니다.");window.open('about:blank','_self').self.close();</script>`);
            }

            // 비밀번호 초기화하고
            let newPassword = randomString(8);
            let salt = bcrypt.genSaltSync(SALT_ROUNDS);
            let passwordHash = bcrypt.hashSync(newPassword, salt);
            // 비밀번호 해시화해서 저장.
            query(connection, res,
               `UPDATE user_tbl
                SET password = ?
                WHERE user_id = ?`, [passwordHash, result[0].user_id])
            .then((updateResult) => {
                let smtpTransport = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: '732team@gmail.com',
                        pass: 'clftkadl1231'
                    }
                });

                let mailOptions = {
                    from: '"732team" <732team@gmail.com>',
                    to: result[0].email,
                    subject: '732 새로운 비밀번호',
                    // text: '평문 보내기 테스트 '
                    html:`<h1>새로운 비밀번호<br>${newPassword}</h1>`
                };

                smtpTransport.sendMail(mailOptions, (error, response) => {
                    smtpTransport.close();

                    if ( error ) {
                        connection.release();
                        return res.send(`<script type="text/javascript">alert("에러가 발생했습니다. 다시 시도해 주세요.");window.open('about:blank','_self').self.close();</script>`);
                    }

                    // 초기화 했으니까 초기화 로그 테이블에 업데이트
                    query(connection, res,
                       `UPDATE password_reset_log_tbl
                        SET is_reset = TRUE
                        WHERE password_reset_log_id = ?`, [id])
                    .then((updateResult) => {
                        connection.release();
                        return res.send(`<script type="text/javascript">alert("메일함을 확인해주세요.");window.open('about:blank','_self').self.close();</script>`);
                    });
                });
            });
        });
    });
});

app.get('/email/:email/checking', (req, res) => {
    let email = req.params.email;

    if ( email === undefined || !EMAIL_REGEXP.test(email)) {
        return res.status(400).json(
            resultArray.toCamelCase(
                {
                    meta: {
                        code: -27,
                        message: "이메일을 바르게 입력해주세요."
                    }
                }
            )
        );
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM user_tbl
            WHERE email = ?`, [email])
        .then((result) => {
            connection.release();
            return res.status(200).json(
                resultArray.toCamelCase(
                    SUCCESS,
                    {
                        isDuplicated: result.length === 0 ? false : true
                    }
                )
            );
        });
    });
});

app.get('/nickname/:nickname/checking', (req, res) => {
    let nickname = req.params.nickname;

    if ( nickname === undefined || nickname.trim() === "" || 0 > nickname.length || nickname.length > 12 ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }
    // 글자수 제한 예외처리

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM user_tbl
            WHERE nickname = ?`, [nickname])
        .then((result) => {
            connection.release();
            return res.status(200).json(
                resultArray.toCamelCase(
                    SUCCESS,
                    {
                        isDuplicated: result.length === 0 ? false : true
                    }
                )
            );
        });
    });
});

app.get('/id/:id/checking', (req, res) => {
    let id = req.params.id;

    if ( id === undefined || id.trim() === "" || !LOGIN_ID_REGEXP.test(id) ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    // 아이디 형식 제한 예외처리

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM user_tbl
            WHERE login_id = ?`, [id])
        .then((result) => {
            connection.release();
            return res.status(200).json(
                resultArray.toCamelCase(
                    SUCCESS,
                    {
                        isDuplicated: result.length === 0 ? false : true
                    }
                )
            );
        });
    });
});

// let ssdasdasd = schedule.scheduleJob('15 * * * * *', () => {
//     dbConnect2().then((connection) => {
//         query2(connection,
//            `SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%c월 %e일") AS mission_date
//             FROM mission_tbl
//             WHERE mission_tbl.mission_date <= DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
//             ORDER BY mission_tbl.mission_date DESC
//             LIMIT 1`)
//         .then((missionResult) => {
//             query2(connection,
//                `SELECT gcm_token
//                 FROM user_tbl
//                 WHERE deleted_at IS NULL
//                 AND gcm_token IS NOT NULL
//                 AND is_notified = TRUE`)
//             .then((tokenResult) => {
//                 let tokens = _.pluck(tokenResult, "gcm_token");
//                 console.log(tokens);
//                 let mission = JSON.parse(missionResult[0].mission);
//                 sendFCM( `${missionResult[0].mission_date} 오늘의 잠상 만나는 봤나?(진지진지)\n${mission.text}`, {}, tokens );
//             });
//         });
//     });
// });


let morning = schedule.scheduleJob('32 7 * * *', () => {
    console.log(Date() + " morning");
    dbConnect2().then((connection) => {
        query2(connection,
           `SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%c월 %e일") AS mission_date
            FROM mission_tbl
            WHERE mission_tbl.mission_date <= DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
            ORDER BY mission_tbl.mission_date DESC
            LIMIT 1`)
        .then((missionResult) => {
            query2(connection,
               `SELECT gcm_token
                FROM user_tbl
                WHERE deleted_at IS NULL
                AND gcm_token IS NOT NULL
                AND is_notified = TRUE`)
            .then((tokenResult) => {
                connection.release();
                let tokens = _.pluck(tokenResult, "gcm_token");
                let mission = JSON.parse(missionResult[0].mission);

                sendFCM( mission.text, `오늘의 잠상을 당신의 시선으로 표현해주세요🤗`, {}, tokens );
            });
        });
    });
});

let afternoon = schedule.scheduleJob('32 13 * * *', () => {
    console.log(Date() + " afternoon");
    dbConnect2().then((connection) => {
        query2(connection,
           `SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%c월 %e일") AS mission_date
            FROM mission_tbl
            WHERE mission_tbl.mission_date <= DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
            ORDER BY mission_tbl.mission_date DESC
            LIMIT 1`)
        .then((missionResult) => {
            query2(connection,
               `SELECT gcm_token
                FROM user_tbl
                WHERE deleted_at IS NULL
                AND gcm_token IS NOT NULL
                AND is_notified = TRUE`)
            .then((tokenResult) => {
                connection.release();
                let tokens = _.pluck(tokenResult, "gcm_token");
                let mission = JSON.parse(missionResult[0].mission);

                sendFCM( mission.text, `나른한 오후, 사진 한장의 여유 어떠세요?😉`, {}, tokens );
            });
        });
    });
});

let night = schedule.scheduleJob('32 19 * * *', () => {
    console.log(Date() + " night");
    dbConnect2().then((connection) => {
        query2(connection,
           `SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%c월 %e일") AS mission_date
            FROM mission_tbl
            WHERE mission_tbl.mission_date <= DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
            ORDER BY mission_tbl.mission_date DESC
            LIMIT 1`)
        .then((missionResult) => {
            query2(connection,
               `SELECT gcm_token
                FROM user_tbl
                WHERE deleted_at IS NULL
                AND gcm_token IS NOT NULL
                AND is_notified = TRUE`)
            .then((tokenResult) => {
                connection.release();
                let tokens = _.pluck(tokenResult, "gcm_token");
                let mission = JSON.parse(missionResult[0].mission);

                sendFCM( mission.text, `오늘의 잠상, 만나는 봤나?🤔🤔`, {}, tokens );
            });
        });
    });
});

// app.get('*', (req, res) => {
//     res.sendFile(path.resolve(__dirname, './../public/index.html'));
// });



// var checkAuth = (cert) => {

//     // * allow access if certificate subject Common Name is 'Doug Prishpreed'.
//     // * this is one of many ways you can authorize only certain authenticated
//     // * certificate-holders; you might instead choose to check the certificate
//     // * fingerprint, or apply some sort of role-based security based on e.g. the OU
//     // * field of the certificate. You can also link into another layer of
//     // * auth or session middleware here; for instance, you might pass the subject CN
//     // * as a username to log the user in to your underlying authentication/session
//     // * management layer.

//     console.log(1234);

//     return cert.subject.CN === 'Doug Prishpreed';
// };

// https.createServer(opts, app).listen(port, function(){
//     console.log("Https server listening on port " + port);
// });

const server = app.listen(port, () => {
    console.log(Date() + 'Express listening on port', port);
});