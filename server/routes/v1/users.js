import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import stringLength from 'string-length';
import { TOKEN_KEY, SALT_ROUNDS } from '../../main';
import { DB_ERROR, NO_DATA, SUCCESS, INVALID_REQUEST, EMAIL_REGEXP, PASSWORD_REGEXP, LOGIN_ID_REGEXP, IS_MY_ID, query, dbConnect, resultArray, LOGIN_EXPIRY_TIME } from '../../utils';

const router = express.Router();

// 유저 전체 목록
router.get('/', (req, res) => {

});

// 회원가입
router.post('/', (req, res) => {
    let loginId              = req.body.loginId;
    let password             = req.body.password;
    let reEnterPassword      = req.body.reEnterPassword;
    let email                = req.body.email;
    let nickname             = req.body.nickname;

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

    if ( 0 > stringLength(nickname) || stringLength(nickname) > 12 ) {
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

    if ( email !== undefined && !EMAIL_REGEXP.test(email)) {
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

    let salt = bcrypt.genSaltSync(SALT_ROUNDS);
    let passwordHash = bcrypt.hashSync(password, salt);

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id, deleted_at FROM user_tbl WHERE login_id = ?`, [loginId]).then((result) => {
            if (result.length > 0) {
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
            }
            query(connection, res,
               `SELECT * FROM user_tbl WHERE email = ?`, [email]
            ).then((duplicateResult) => {
                if ( duplicateResult.length > 0 ) { // 중복 있으면 에러
                    connection.release();
                    return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
                }
                query(connection, res,
                   `INSERT INTO user_tbl(login_id, password, nickname, email) VALUES(?, ?, ?, ?)`,
                    [
                        loginId,
                        passwordHash,
                        nickname,
                        email
                    ]
                ).then((signUpResult) => {
                    let payLoad = {userId:signUpResult.insertId}
                    let token = jwt.sign(payLoad, TOKEN_KEY,{
                        algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                        expiresIn : LOGIN_EXPIRY_TIME // 5 days
                    });
                    connection.release();
                    // 로그인 성공이든 실패든 접속에 대한 로그를 남겨야할것 같음.
                    return res.status(201).json(
                        resultArray.toCamelCase(
                            SUCCESS,
                            {
                                token: token
                            }
                        )
                    );
                });
            });
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
            }
            query(connection, res,
               `SELECT * FROM user_tbl WHERE email = ?`, [email]
            ).then((duplicateResult) => {
                if ( duplicateResult.length > 0 ) { // 중복 있으면 에러
                    connection.release();
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta: {
                                    code: -33,
                                    message: "이미 사용중인 이메일입니다."
                                }
                            }
                        )
                    );
                }
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
            });
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
                        connection.release();
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
                        connection.release();
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
                    // let token = jwt.sign(payLoad, TOKEN_KEY,{
                    //     algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                    //     expiresIn : LOGIN_EXPIRY_TIME // 5 days
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
                    connection.release();
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

    if ( nickname === undefined || 0 > stringLength(nickname) || stringLength(nickname) > 12 ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            // console.log(result);
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }
            query(connection, res,
               `SELECT * FROM user_tbl WHERE nickname = ?`, [nickname]
            ).then((duplicateResult) => {
                if ( duplicateResult.length > 0 ) { // 중복 있으면 에러
                    connection.release();
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta: {
                                    code: -34,
                                    message: "이미 사용중인 닉네임입니다."
                                }
                            }
                        )
                    );
                }
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
            });
        });
    });
});

// 내 정보
router.get('/:userId', (req, res) => {
    let id = req.authorizationId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT user_id, login_id, nickname, email, created_at, is_notified
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
    let authorization = req.headers.authorization;

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
                    try{
                        let decoded = jwt.verify(authorization, TOKEN_KEY);
                        // 못쓰는 토큰으로 만든다.
                        query(connection, res, `INSERT INTO invalid_token_tbl(invalid_token, expired_to) VALUES(?, FROM_UNIXTIME(?))`, [authorization, decoded.exp])
                        .then((insertResult) => {
                            connection.release();
                            return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                        });
                    } catch(err) {
                        connection.release();
                        return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                    }
                });
            }
        });
    });
});

// 로그아웃
router.delete('/:userId/token', (req, res) => {
    let authorization = req.headers.authorization;

    try{
        let decoded = jwt.verify(authorization, TOKEN_KEY);
        // 못쓰는 토큰으로 만든다.
        dbConnect(res).then((connection) => {
            query(connection, res, `INSERT INTO invalid_token_tbl(invalid_token, expired_to) VALUES(?, FROM_UNIXTIME(?))`, [authorization, decoded.exp])
            .then((insertResult) => {
                connection.release();
                return res.status(200).json(resultArray.toCamelCase(SUCCESS));
            });
        });
    } catch(err) {
        return res.status(200).json(resultArray.toCamelCase(SUCCESS));
    }
});

// fcm 토큰 등록
router.put('/:userId/fcm', (req, res) => {
    let id = req.authorizationId;

    let fcmToken = req.body.fcmToken;

    if ( fcmToken === undefined || fcmToken.trim() === "" ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `UPDATE user_tbl SET gcm_token = NULL WHERE gcm_token = ?`, [fcmToken]
                ).then((fcmInitResult) => {
                    query(connection, res,
                       `UPDATE user_tbl SET gcm_token = ? WHERE user_id = ?`, [fcmToken, id]
                    ).then((fcmResult) => {
                        connection.release();
                        return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                    });
                });
            }
        });
    });
});

// alram on/offset
router.put('/:userId/alarm', (req, res) => {
    let authorization = req.headers.authorization;

    dbConnect(res).then((connection) => {
        query(connection, res, `SELECT user_id FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `UPDATE user_tbl
                    SET is_notified = NOT is_notified
                    WHERE user_id = ?`, [id]
                ).then((fcmResult) => {
                    connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                });
            }
        });
    });
});

// 로그인
router.post('/:userId/token', (req, res) => {
    // res.setHeader("Access-Control-Allow-Origin", "*");
    let loginId = req.body.loginId;
    let password = req.body.password;

    // let email = req.query.email;
    // let password = req.query.password;

    if ( loginId === undefined || password === undefined ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    // if ( !LOGIN_ID_REGEXP.test(loginId) ) {
    //     return res.status(400).json(
    //         resultArray.toCamelCase(
    //             {
    //                 meta: {
    //                     code: -24,
    //                     message: "로그인 ID는 영어와 숫자를 포함한 6~16글자로 작성해 주세요."
    //                 }
    //             }
    //         )
    //     );
    // }

    if ( !EMAIL_REGEXP.test(loginId) && !LOGIN_ID_REGEXP.test(loginId) ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT user_id, login_id, password
            FROM user_tbl
            WHERE deleted_at IS NULL
            AND (login_id = ? OR email = ?)`, [loginId, loginId])
        .then((result) => {
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
                    let payLoad = {userId:result[0].user_id}
                    let token = jwt.sign(payLoad, TOKEN_KEY,{
                        algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                        expiresIn : LOGIN_EXPIRY_TIME // 5 days
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

// 유저의 컨텐츠(비공개 포함)
router.get('/:userId/contents', (req, res) => {
    let userId = req.authorizationId;

    let sort = req.query.sort;

    let offset = req.query.offset;
    let limit = req.query.limit;

    let type = req.query.type;

    let sortQuery = "";
    let sortUrl = "";

    if ( sort === '-created_at' ) { // 최신순
        sortQuery = "ORDER BY v1.created_at DESC"
        sortUrl = '&sort=-created_at';
    } else if ( sort === '-like_count' ) { // 인기순
        sortQuery = "ORDER BY like_count DESC, v1.created_at ASC"
        sortUrl = '&sort=-like_count';
    } else { // 그외 이상한 데이터 들어오면 최신순
        sortQuery = "ORDER BY v1.created_at DESC"
        sortUrl = '&sort=-created_at';
    }

    let typeQuery = "";
    let typeUrl = "";
    if ( type === "private" ) {
        typeQuery = "AND t1.is_public = FALSE";
        typeUrl = "&type=private";
    }

    if(offset === undefined || isNaN(offset) === true){
        offset = 0;
    }

    if(limit === undefined || isNaN(limit) === true){
        limit = 30;
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT
                v1.content_id,
                v1.content,
                v1.user_id,
                v1.mission_id,
                v1.mission,
                DATE_FORMAT(v1.created_at, "%Y년 %c월 %e일") AS created_at,
                v1.nickname,
                v1.is_public,
                IF(SUM(v2.like) IS NULL , 0, SUM(v2.like)) AS like_count
            FROM(
                SELECT
                    u1.content_id,
                    u1.content,
                    u1.user_id,
                    u1.mission_id,
                    u1.mission,
                    u1.is_public,
                    u1.created_at,
                    u2.nickname
                FROM (
                    SELECT
                        t1.content_id,
                        t1.content,
                        t1.user_id,
                        t1.mission_id,
                        t2.mission,
                        t1.is_public,
                        t1.created_at
                    FROM content_tbl AS t1
                    INNER JOIN mission_tbl AS t2
                    ON t1.mission_id = t2.mission_id
                    WHERE t1.user_id = ?
                    ${typeQuery}
                    AND t1.is_banned = FALSE
                    AND t1.deleted_at IS NULL ) AS u1
                INNER JOIN user_tbl AS u2
                ON u1.user_id = u2.user_id ) v1
            LEFT OUTER JOIN content_like_tbl AS v2
            ON v1.content_id = v2.content_id
            GROUP BY v1.content_id
            HAVING like_count >= 0
            ${sortQuery}
            LIMIT ? OFFSET ?`, [userId, Number(limit), Number(offset)]) // 차단당하지 않았고 삭제되지 않은 내 게시글을 가져옴
        .then((selectResult) => {
            query(connection, res,
               `SELECT COUNT(t1.content_id) AS count
                FROM content_tbl AS t1
                WHERE t1.user_id = ?
                ${typeQuery}
                AND t1.is_banned = FALSE
                AND t1.deleted_at IS NULL`, [userId]) // 차단당하지 않았고 삭제되지 않은 내 게시글 갯수를 가져옴
            .then((countResult) => {
                let currentUrl = `${req.protocol}://${req.get('host') + (req.path.length === 1 ? req.baseUrl : req.baseUrl + req.path)}`;

                let offsetUrl = `&offset=${( selectResult.length === 0 ? offset : Number( offset ) + Number( limit ) )}`;
                let nextUrl = `${currentUrl}?limit=${Number(limit) + offsetUrl + sortUrl + typeUrl}`;

                connection.release();
                return res.status(200).json(
                    resultArray.toCamelCase(
                        SUCCESS,
                        {
                            contentsCount: countResult[0].count,
                            contents: selectResult
                        },
                        nextUrl
                    )
                );
            });
        });
    });
});

// 유저의 컨텐츠 상세보기
router.get('/:userId/contents/:contentId', (req, res) => {
    let userId = req.authorizationId;

    let contentId = req.params.contentId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT
                v1.content_id,
                v1.content,
                v1.user_id,
                v1.mission_id,
                v1.mission,
                DATE_FORMAT(v1.mission_date, "%Y년 %c월 %e일") AS mission_date,
                DATE_FORMAT(v1.created_at, "%Y년 %c월 %e일") AS created_at,
                v1.nickname,
                v1.is_public,
                IF(SUM(v2.like) IS NULL , 0, SUM(v2.like)) AS like_count
            FROM(
                SELECT
                    u1.content_id,
                    u1.content,
                    u1.user_id,
                    u1.mission_id,
                    u1.mission,
                    u1.mission_date,
                    u1.is_public,
                    u1.created_at,
                    u2.nickname
                FROM (
                    SELECT
                        t1.content_id,
                        t1.content,
                        t1.user_id,
                        t1.mission_id,
                        t2.mission,
                        t2.mission_date,
                        t1.is_public,
                        t1.created_at
                    FROM content_tbl AS t1
                    INNER JOIN mission_tbl AS t2
                    ON t1.mission_id = t2.mission_id
                    WHERE t1.content_id = ?
                    AND t1.user_id = ?
                    AND t1.is_banned = FALSE
                    AND t1.deleted_at IS NULL ) AS u1
                INNER JOIN user_tbl AS u2
                ON u1.user_id = u2.user_id ) v1
            LEFT OUTER JOIN content_like_tbl AS v2
            ON v1.content_id = v2.content_id`, [contentId, userId]) // 차단당하지 않았고 삭제되지 않은 게시글 가져옴
        .then((selectResult) => {
            if ( selectResult[0].content_id === null ) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }

            query(connection, res,
               `SELECT *
                FROM content_like_tbl
                WHERE content_id = ?`, [contentId]) // 좋아요 가져옴
            .then((likeResult) => {
                let isLiked = false;
                let likeCount = 0;
                likeResult.forEach( (like) => {
                    if ( Number(like.like) === 1 ) {
                        likeCount++;
                        if ( Number(like.user_id) === Number(userId) ){
                            isLiked = true;
                        }
                    }
                });

                selectResult[0].isLiked = isLiked;
                selectResult[0].likeCount = likeCount;

                query(connection, res,
                   `SELECT  t1.reply_id,
                            t1.user_id,
                            t2.nickname,
                            t1.reply,
                            DATE_FORMAT(t1.created_at, "%Y년 %c월%e일") AS created_at
                    FROM content_reply_tbl AS t1
                    INNER JOIN user_tbl AS t2
                    ON t1.user_id = t2.user_id
                    WHERE t1.content_id = ?
                    AND t1.deleted_at IS NULL
                    ORDER BY t1.created_at DESC`, [contentId]) // 삭제되지 않은 댓글 가져옴
                .then((replyResult) => {

                    if( Number(userId) === Number(selectResult[0].user_id) ) {
                        selectResult[0].isMine = true;
                    } else {
                        selectResult[0].isMine = false;
                    }

                    replyResult = replyResult.map((reply) => {
                        if ( Number(userId) === Number(reply.user_id) ) {
                            reply.isMine = true;
                        } else {
                            reply.isMine = false;
                        }
                        return reply;
                    });

                    selectResult[0].replies = replyResult;

                    connection.release();
                    return res.status(200).json(
                        resultArray.toCamelCase(
                            SUCCESS,
                            {
                                content: selectResult[0]
                            }
                        )
                    );
                });
            });
        });
    });
});


// 받아보기 목록에 추가, 제거
router.post('/:userId/followers', (req, res) => {
    let userId = req.authorizationId;

    let followUserId = req.body.followUserId; // 내가 게시글을 받아볼 사용자의 ID

    if ( Number(userId) === Number(followUserId) ) { // 나 자신을 팔로우 하려 할 때
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT user_id
            FROM user_tbl
            WHERE user_id = ?
            AND deleted_at IS NULL`, [followUserId]
        ).then((followSearchResult) => {
            if (followSearchResult.length === 0) { // 탈퇴했거나 존재하지 않는 사용자
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }
            query(connection, res,
               `INSERT INTO user_follow_tbl(user_id, follow_user_id)
                VALUES(?, ?)
                ON DUPLICATE KEY UPDATE is_followed = NOT is_followed;`,
                [userId, followUserId]
            ).then((followResult) => {
                connection.release();
                return res.status(200).json(resultArray.toCamelCase(SUCCESS));
            });
        });
    });

});

// 내가 받아보는 사람 목록
router.get('/:userId/followers', (req, res) => {
    let userId = req.authorizationId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT t1.follow_user_id, t2.nickname
            FROM user_follow_tbl AS t1
            INNER JOIN user_tbl AS t2
            ON t1.follow_user_id = t2.user_id
            WHERE t1.user_id = ?
            AND t1.is_followed IS TRUE
            AND t2.deleted_at IS NULL`, [userId]
        ).then((result) => {
            connection.release();
            return res.status(200).json(
                resultArray.toCamelCase(
                    SUCCESS,
                    {
                        followersCount: result.length,
                        followers: result
                    }
                )
            );
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