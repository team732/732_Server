import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { ADMIN_TOKEN_KEY, SALT_ROUNDS } from '../../../main';
import { DB_ERROR, NO_DATA, SUCCESS, INVALID_REQUEST, EMAIL_REGEXP, PASSWORD_REGEXP, LOGIN_ID_REGEXP, IS_MY_ID, query, dbConnect, resultArray, ADMIN_LOGIN_EXPIRY_TIME } from '../../../utils';

const router = express.Router();

// 회원가입
router.post('/', (req, res) => {
    let loginId              = req.body.loginId;
    let password             = req.body.password;
    let reEnterPassword      = req.body.reEnterPassword;
    let name                 = req.body.name;

    if (   password === undefined ||
           reEnterPassword === undefined ||
           loginId === undefined ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    if ( !LOGIN_ID_REGEXP.test(loginId) ) {
        return res.status(400).json(
            resultArray.toCamelCase(
                {
                    meta: {
                        code: -24,
                        message: "로그인 ID는 영어와 숫자를 포함한 6~16글자로 작성해 주세요."
                    }
                }
            )
        );
    }

    if ( 0 > name.length || name.length > 12 ) {
        return res.status(400).json(
            resultArray.toCamelCase(
                {
                    meta: {
                        code: -25,
                        message: "별명은 12글자 이하로 작성해 주세요."
                    }
                }
            )
        );
    }

    if(password !== reEnterPassword){
        return res.status(400).json(
            resultArray.toCamelCase(
                {
                    meta: {
                        code: -26,
                        message: "비밀번호와 비밀번호 확인이 일치하지 않습니다."
                    }
                }
            )
        );
    }

    if (!PASSWORD_REGEXP.test(password)) {
        return res.status(400).json(
            resultArray.toCamelCase(
                {
                    meta: {
                        code: -28,
                        message: "비밀번호는 영대문자, 영소문자, 숫자를 이용한 6~16글자로 작성해 주세요."
                    }
                }
            )
        );
    }

    let salt = bcrypt.genSaltSync(SALT_ROUNDS);
    let passwordHash = bcrypt.hashSync(password, salt);

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT admin_user_id, deleted_at FROM admin_user_tbl WHERE login_id = ?`, [loginId]).then((result) => {
            if (result.length !== 0) {
                connection.release();
                if (result[0].deleted_at === null) { // 이미 가입한 아이디
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta:{
                                    code: -29,
                                    message: "이미 존재하는 아이디 입니다."
                                }
                            }
                        )
                    );
                } else { // 탈퇴한 아이디
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta:{
                                    code: -30,
                                    message: "가입할수 없는 아이디 입니다."
                                }
                            }
                        )
                    );
                }
            } else {
                query(connection, res,
                   `INSERT INTO admin_user_tbl(login_id, password, name) VALUES(?, ?, ?)`,
                    [
                        loginId,
                        passwordHash,
                        name,
                    ]
                ).then((signUpResult) => {
                    let payLoad = {userId:signUpResult.insertId, name:name}
                    let token = jwt.sign(payLoad, ADMIN_TOKEN_KEY,{
                        algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                        expiresIn : ADMIN_LOGIN_EXPIRY_TIME // 5 days
                    });
                    connection.release();
                    // 로그인 성공이든 실패든 접속에 대한 로그를 남겨야할것 같음.
                    return res.status(201).json(
                        resultArray.toCamelCase(
                            SUCCESS,
                            {
                                token:token
                            }
                        )
                    );
                });
            }
        });
    });
});

// email 등록
router.put('/:userId/email', (req, res) => {
    let id = req.authorizationId;
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
        query(connection, res, `SELECT user_id FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `UPDATE user_tbl SET email = ? WHERE user_id = ?`,
                    [
                        email,
                        id
                    ]
                ).then((changeResult) => {
                    connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                });
            }
        });
    });
});

// 비밀번호 수정
router.put('/:userId/password', (req, res) => {
    let id = req.authorizationId;
    let password = req.body.password;
    let newPassword = req.body.newPassword;
    let reEnterNewPassword = req.body.reEnterNewPassword;

    if (   password === undefined ||
           newPassword === undefined ||
           reEnterNewPassword === undefined ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id, password FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                let passwordResult = bcrypt.compareSync(password, result[0].password);

                if ( passwordResult ) { // 비밀번호 일치

                    if(newPassword !== reEnterNewPassword){
                        return res.status(400).json(
                            resultArray.toCamelCase(
                                {
                                    meta: {
                                        code: -26,
                                        message: "비밀번호와 비밀번호 확인이 일치하지 않습니다."
                                    }
                                }
                            )
                        );
                    }

                    if (!PASSWORD_REGEXP.test(newPassword)) {
                        return res.status(400).json(
                            resultArray.toCamelCase(
                                {
                                    meta: {
                                        code: -28,
                                        message: "비밀번호는 영대문자, 영소문자, 숫자를 이용한 6~16글자로 작성해 주세요."
                                    }
                                }
                            )
                        );
                    }

                    let salt = bcrypt.genSaltSync(SALT_ROUNDS);
                    let passwordHash = bcrypt.hashSync(newPassword, salt);

                    query(connection, res,
                       `UPDATE user_tbl SET password = ? WHERE user_id = ?`,
                        [
                            passwordHash,
                            id
                        ]
                    ).then((changeResult) => {
                        connection.release();
                        return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                    });

                    // let payLoad = {id:result[0].id}
                    // let token = jwt.sign(payLoad, ADMIN_TOKEN_KEY,{
                    //     algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                    //     expiresIn : ADMIN_LOGIN_EXPIRY_TIME // 5 days
                    // });
                    // // 로그인 성공이든 실패든 접속에 대한 로그를 남겨야할것 같음.
                    // return res.json(
                    //     resultArray.toCamelCase(
                    //         SUCCESS,
                    //         {
                    //             token : token
                    //         }
                    //     )
                    // );
                } else { // 비밀번호 불일치
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta: {
                                    code: -32,
                                    message: "아이디와 비밀번호를 확인해주세요."
                                }
                            }
                        )
                    );
                }
            }
        });
    });
});

// nickname 수정
router.put('/:userId/nickname', (req, res) => {
    let id = req.authorizationId;
    let nickname = req.body.nickname;

    if ( nickname === undefined || 0 > nickname.length || nickname.length > 12 ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            console.log(result);
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `UPDATE user_tbl SET nickname = ? WHERE user_id = ?`,
                    [
                        nickname,
                        id
                    ]
                ).then((changeResult) => {
                    connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                });
            }
        });
    });
});

// 내 정보
router.get('/:userId', (req, res) => {
    let id = req.authorizationId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT user_id, login_id, nickname, email, created_at
            FROM user_tbl
            WHERE user_id = ?
            AND deleted_at IS NULL`, [id]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                connection.release();
                return res.status(200).json(resultArray.toCamelCase(result[0]));
            }
        });
    });
});

// 내 정보 수정
router.put('/:userId', (req, res) => {

});

// 탈퇴
router.delete('/:userId', (req, res) => {
    let id = req.authorizationId;

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `UPDATE user_tbl SET deleted_at = NOW() WHERE user_id = ?`,
                    [
                        id
                    ]
                ).then((deleteResult) => {
                    connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                    // + 토큰 제거
                });
            }
        });
    });
});

// 로그인
router.post('/:userId/token', (req, res) => {
    // res.setHeader("Access-Control-Allow-Origin", "*");
    // response.setHeader("Access-Control-Allow-Origin", "*");
    let loginId = req.body.loginId;
    let password = req.body.password;

    // console.log(req.body);

    if ( loginId === undefined || password === undefined ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT admin_user_id, login_id, password, name
            FROM admin_user_tbl
            WHERE deleted_at IS NULL
            AND login_id = ?`, [loginId]).then((result) => {
            connection.release();
            if(result.length === 0){
                // 아이디가 없음.
                return res.status(400).json(
                    resultArray.toCamelCase(
                        {
                            meta:{
                                code: -31,
                                message: "아이디와 비밀번호를 확인해주세요."
                            }
                        }
                    )
                );
            } else {
                let passwordResult = bcrypt.compareSync(password, result[0].password);

                if ( passwordResult ) { // 비밀번호 일치
                    let payLoad = {userId: result[0].admin_user_id, name: result[0].name}
                    let token = jwt.sign(payLoad, ADMIN_TOKEN_KEY,{
                        algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                        expiresIn : ADMIN_LOGIN_EXPIRY_TIME // 5 days
                    });
                    // 로그인 성공이든 실패든 접속에 대한 로그를 남겨야할것 같음.
                    return res.json(
                        resultArray.toCamelCase(
                            SUCCESS,
                            {
                                token : token
                            }
                        )
                    );
                } else { // 비밀번호 불일치
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta: {
                                    code: -32,
                                    message: "아이디와 비밀번호를 확인해주세요."
                                }
                            }
                        )
                    );
                }
            }
        });
    });
});

// // 유저 미션 수행 여부
// router.get('/:userId/missions/:missionId', (req, res) => {

// });

// 오늘까지의 미션 목록
router.get('/:userId/missions', (req, res) => {

});

export default router;