import express from 'express';
import multiparty from 'multiparty';
import _ from 'underscore';
import dateFormat from 'dateformat';
import stringLength from 'string-length';
import { DB_ERROR, NO_DATA, SUCCESS, INVALID_REQUEST, EMAIL_REGEXP, PASSWORD_REGEXP, IS_MY_ID, query, dbConnect, resultArray, isSet, isValidDate, sendFCM } from '../../utils';

const router = express.Router();

// 글 목록 (월간 주간 명예의 전당)
router.get('/', (req, res) => {
    let userId = req.authorizationId;

    // let startDate = req.query.start;
    // let endDate = req.query.end;

    let type = req.query.type;

    // if ( isValidDate(startDate) === false || isValidDate(endDate) === false ) {
    //     return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    // }

    let startDate = new Date();
    let endDate = new Date();

    // 월 - 일
    let dayArr = [6, 0, 1, 2, 3, 4, 5];

    if ( type === "monthly" ) { // 월간
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        endDate.setDate(1);
    } else { // 주간
        startDate.setDate(startDate.getDate() - (dayArr[startDate.getDay()] + 7) );
        endDate.setDate(endDate.getDate() - (dayArr[endDate.getDay()]) );
    }

    startDate = dateFormat(startDate, 'yyyy-mm-dd 07:30:00');
    endDate = dateFormat(endDate, 'yyyy-mm-dd 07:30:00');

    // console.log(startDate);
    // console.log(endDate);

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
                IF(SUM(v2.like) IS NULL , 0, SUM(v2.like)) AS like_count
            FROM(
                SELECT
                    u1.content_id,
                    u1.content,
                    u1.user_id,
                    u1.mission_id,
                    u1.mission,
                    u1.mission_date,
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
                        t1.created_at
                    FROM content_tbl AS t1
                    INNER JOIN mission_tbl AS t2
                    ON t1.mission_id = t2.mission_id
                    WHERE t1.is_public = TRUE
                    AND t1.is_banned = FALSE
                    AND t1.deleted_at IS NULL
                    AND ? <= t2.mission_date
                    AND t2.mission_date < ?) AS u1
                INNER JOIN user_tbl AS u2
                ON u1.user_id = u2.user_id ) v1
            LEFT OUTER JOIN content_like_tbl AS v2
            ON v1.content_id = v2.content_id
            GROUP BY v1.content_id
            HAVING like_count >= 0
            ORDER BY like_count DESC, v1.created_at ASC
            LIMIT 10`, [startDate, endDate])
        .then((selectResult) => {

            connection.release();
            return res.status(200).json(
                resultArray.toCamelCase(
                    SUCCESS,
                    {
                        contentsCount : selectResult.length,
                        contents: selectResult
                    }
                )
            );
        });
    });
});

// 게시글 상세보기
router.get('/:contentId', (req, res) => {
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
                IF(SUM(v2.like) IS NULL , 0, SUM(v2.like)) AS like_count
            FROM(
                SELECT
                    u1.content_id,
                    u1.content,
                    u1.user_id,
                    u1.mission_id,
                    u1.mission,
                    u1.mission_date,
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
                        t1.created_at
                    FROM content_tbl AS t1
                    INNER JOIN mission_tbl AS t2
                    ON t1.mission_id = t2.mission_id
                    WHERE t1.content_id = ?
                    AND t1.is_public = TRUE
                    AND t1.is_banned = FALSE
                    AND t1.deleted_at IS NULL ) AS u1
                INNER JOIN user_tbl AS u2
                ON u1.user_id = u2.user_id ) v1
            LEFT OUTER JOIN content_like_tbl AS v2
            ON v1.content_id = v2.content_id`, [contentId]) // 공개되어있고 차단당하지 않았고 삭제되지 않은 게시글 가져옴
        .then((selectResult) => {
            if ( selectResult.length === 0 ) {
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
                    query(connection, res,
                       `UPDATE content_tbl
                        SET view_count = view_count + 1
                        WHERE content_id = ?`, [contentId]) // view count 증가
                    .then((countResult) => {
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
});

// 게시글 공개여부 수정
router.put('/:contentId/public', (req, res) => {
    let userId = req.authorizationId;

    let contentId = req.params.contentId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM content_tbl
            WHERE user_id = ?
            AND content_id = ?
            AND is_banned = FALSE
            AND deleted_at IS NULL`, [userId, contentId])
        .then((selectResult) => {
            if ( selectResult.length === 0 ) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }

            query(connection, res,
               `SELECT content_id
                FROM content_tbl
                WHERE user_id = ?
                AND mission_id = ?
                AND is_public = true
                AND is_banned = false
                AND deleted_at IS NULL`,
                [Number(userId), Number(selectResult[0].mission_id)])
            .then((userMissionResult) => {
                if ( userMissionResult.length > 2 && Boolean(selectResult[0].is_public) === false ) { // 해당 미션에 이미 공개된 게시글이 3개 이상 있는경우
                    connection.release();
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta: {
                                    code: -44,
                                    message: "해당 미션에 공개가능한 게시글 초과."
                                }
                            }
                        )
                    );
                }

                query(connection, res,
                   `UPDATE content_tbl
                    SET is_public = NOT is_public
                    WHERE content_id = ?`, [contentId])
                .then((selectResult) => {
                    connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                });
            });
        });
    });
});

// 게시글 텍스트 수정
router.put('/:contentId/text', (req, res) => {
    let userId = req.authorizationId;

    let contentId = req.params.contentId;

    let text = req.body.text;

    if ( text === undefined ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    if ( text !== "" && (140 < stringLength(text.trim()) || stringLength(text.trim()) < 1) ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM content_tbl
            WHERE user_id = ?
            AND content_id = ?
            AND is_banned = FALSE
            AND deleted_at IS NULL`, [userId, contentId])
        .then((selectResult) => {
            if ( selectResult.length === 0 ) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }

            query(connection, res,
               `UPDATE content_tbl
                SET content = JSON_SET(content, '$.text', ?)
                WHERE content_id = ?`, [text, contentId])
            .then((selectResult) => {
                connection.release();
                return res.status(200).json(resultArray.toCamelCase(SUCCESS));
            });
        });
    });
});

// 게시글 삭제
router.delete('/:contentId', (req, res) => {
    let userId = req.authorizationId;

    let contentId = req.params.contentId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM content_tbl
            WHERE user_id = ?
            AND content_id = ?
            AND is_banned = FALSE
            AND deleted_at IS NULL`, [userId, contentId])
        .then((selectResult) => {
            if ( selectResult.length === 0 ) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }

            query(connection, res,
               `UPDATE content_tbl
                SET deleted_at = NOW()
                WHERE content_id = ?`, [contentId])
            .then((selectResult) => {
                connection.release();
                return res.status(200).json(resultArray.toCamelCase(SUCCESS));
            });
        });
    });
});

// // 글 올리기
// router.post('/', (req, res) => {
//     let userId = req.authorizationId;

//     let form = new multiparty.Form();

//     form.parse(req, (err, fields, files) => {
//         let userMissionId = isSet(fields, "userMissionId");
//         let text          = isSet(fields, "text");
//         let isPublic      = isSet(fields, "isPublic");
//         let photo         = isSet(files, "photo");

//         // photo = photo === undefined ? DEFAULT_USER_IMG : photo;

//         // return res.json(files);

//         if ( userMissionId === undefined ||
//              text === undefined ||
//              isPublic === undefined ||
//              photo === undefined ) {
//             return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
//         }

//         dbConnect(res).then((connection) => {
//             let photoPath = _.isObject(photo) ? photo.path : photo;
//             let d = new Date(Date.now());
//             putObjectToS3(photoPath, '732-10th', `contents/${d.getFullYear()}/${(d.getMonth()+1)}/${d.getDate()}`, (uploadPath, err) => {
//                 if ( err ) {
//                     return res.status(500).json(resultArray.toCamelCase(SERVER_ERROR));
//                 }
//                 console.log(uploadPath);

//                 let content = {
//                     text : text,
//                     picture : uploadPath
//                 };

//                 query(connection, res,
//                    `INSERT INTO content_tbl(content, user_mission_id, is_public)
//                     VALUES(?, ?, ?, ?, ?, ?)
//                     UPDATE `,
//                     [JSON.stringify(content), userMissionId, Boolean(isPublic)])
//                 .then((signupResult) => {
//                     connection.release();
//                     return res.json(
//                         resultArray.toCamelCase(
//                             SUCCESS,
//                             {
//                                 token:token
//                             }
//                         )
//                     );
//                 });
//             });
//         });
//     });
// });

// 글 좋아요
router.post('/:contentId/like', (req, res) => {
    let id = req.authorizationId;
    let contentId = req.params.contentId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT content_id
            FROM content_tbl
            WHERE content_id = ?
            AND deleted_at IS NULL
            AND is_public IS TRUE
            AND is_banned IS FALSE`, [contentId]).then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `INSERT INTO content_like_tbl(content_id, user_id, \`like\`)
                    VALUES(?, ?, TRUE)
                    ON DUPLICATE KEY UPDATE \`like\` = NOT \`like\`;`,
                    [
                        contentId,
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

// 댓글 달기
router.post('/:contentId/replies', (req, res) => {
    let id = req.authorizationId;

    let contentId = req.params.contentId;

    let reply = req.body.reply;

    if ( reply === undefined || reply.trim() === "" ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    if ( 140 < stringLength(reply.trim()) || stringLength(reply.trim()) < 1 ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT t1.content_id, t1.mission_id, t1.user_id, DATE_FORMAT(t2.mission_date, "%c월 %e일") AS mission_date
            FROM content_tbl AS t1
            INNER JOIN mission_tbl AS t2
            ON t1.mission_id = t2.mission_id
            WHERE t1.content_id = ?
            AND t1.deleted_at IS NULL
            AND t1.is_public IS TRUE
            AND t1.is_banned IS FALSE;`, [contentId])
        .then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                let replyObject = {
                    text: reply
                };

                query(connection, res,
                   `INSERT INTO content_reply_tbl(content_id, user_id, reply)
                    VALUES(?, ?, ?);`,
                    [
                        contentId,
                        id,
                        JSON.stringify(replyObject)
                    ]
                ).then((insertResult) => {
                    if( Number(id) === Number(result[0].user_id) ) {
                        return true;
                    } else {
                        return query(connection, res,
                           `SELECT gcm_token
                            FROM user_tbl
                            WHERE user_id = ?
                            AND deleted_at IS NULL
                            AND gcm_token IS NOT NULL`, [result[0].user_id] // 게시글 작성자에게 댓글 알림을 주기위해 gcm토큰을 가져온다.
                        ).then((receiverResult) => {
                            if ( receiverResult.length === 0 ) { // 게시글 작성자가 탈퇴했거나 푸시토큰이 없으면 넘긴다.
                                return true;
                            } else {
                                return query(connection, res,
                                   `SELECT nickname FROM user_tbl WHERE user_id = ? AND deleted_at IS NULL`, [id] // 댓글 작성자의 닉네임을 가져온다.
                                ).then((senderResult) => {
                                    if( senderResult.length === 0 ) { // (그럴리는 없지만) 댓글 작성자가 탈퇴했으면 넘긴다.
                                        return true;
                                    } else { // 푸시보낸다.
                                        let tokens = _.pluck(receiverResult, "gcm_token");
                                        let contentAuthorId = result[0].user_id;
                                        delete(result[0].user_id)
                                        let isSuccess = sendFCM( `${result[0].mission_date} 회원님의 사진에 새로운 댓글이 있습니다.`, `[${senderResult[0].nickname}님의 댓글] ${reply}`, result[0], tokens );

                                        // console.log(wwwwww);

                                        if ( Number(isSuccess) === 1 ) { // 푸시 보내기 성공
                                        // 푸시 로그 남겨야함
                                            let pushContent = {
                                                title: `${result[0].mission_date} 회원님의 사진에 새로운 댓글이 있습니다.`,
                                                body: `[${senderResult[0].nickname}님의 댓글] ${reply}`,
                                                data: result[0]
                                            }
                                            return query(connection, res,
                                               `INSERT INTO user_push_log_tbl(user_id, push_type, push_content)
                                                VALUES(?, ?, ?)`, [contentAuthorId, 1, JSON.stringify(pushContent)] // 푸시 로그 입력
                                            ).then((pushLogInsertResult) => {
                                                return true;
                                            });
                                        } else { // 푸시 보내기 실패
                                            return true;
                                        }
                                    }
                                });
                            }
                        });
                    }
                }).then((finalResult) => { // 최종으로 success하고 DB release
                    let fff = connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                });
            }
        });
    });
});

// 댓글 수정
router.put('/:contentId/replies/:replyId', (req, res) => {
    let id = req.authorizationId;

    let contentId = req.params.contentId;
    let replyId = req.params.replyId;

    let reply = req.body.reply;

    if ( reply === undefined || reply.trim() === "" ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    if ( 140 < stringLength(reply.trim()) || stringLength(reply.trim()) < 1 ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT content_id
            FROM content_tbl
            WHERE content_id = ?
            AND deleted_at IS NULL
            AND is_public IS TRUE
            AND is_banned IS FALSE;`, [contentId])
        .then((result) => {
            // console.log(result.length );
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                query(connection, res,
                   `SELECT reply_id
                    FROM content_reply_tbl
                    WHERE reply_id = ?
                    AND deleted_at IS NULL;`, [replyId])
                .then((replyResult) => {
                    if (replyResult.length === 0) {
                        connection.release();
                        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
                    } else {
                        let replyObject = {
                            text: reply
                        };

                        query(connection, res,
                           `UPDATE content_reply_tbl
                            SET reply = ?
                            WHERE reply_id = ?;`, [JSON.stringify(replyObject), replyId]
                        ).then((changeResult) => {
                            connection.release();
                            return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                        });
                    }
                });
            }
        });
    });
});

// 댓글 좋아요
router.post('/:contentId/replies/:replyId/like', (req, res) => {
    let id = req.authorizationId;
    let contentId = req.params.contentId;
    let replyId = req.params.replyId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT content_id
            FROM content_tbl
            WHERE content_id = ?
            AND deleted_at IS NULL
            AND is_public IS TRUE
            AND is_banned IS FALSE`, [contentId])
        .then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                 query(connection, res,
                   `SELECT content_id
                    FROM content_reply_tbl
                    WHERE reply_id = ?
                    AND deleted_at IS NULL`, [replyId])
                 .then((replyResult) => {
                     if (result.length === 0) {
                        connection.release();
                        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
                    } else {
                        query(connection, res,
                           `INSERT INTO content_reply_like_tbl(reply_id, user_id, \`like\`)
                            VALUES(?, ?, TRUE)
                            ON DUPLICATE KEY UPDATE \`like\` = NOT \`like\`;`,
                            [
                                replyId,
                                id
                            ]
                        ).then((changeResult) => {
                            connection.release();
                            return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                        });
                    }
                });
            }
        });
    });
});

// 댓글 신고(? 테이블 추가해야함)
router.post('/:contentId/replies/:replyId/report', (req, res) => {
    let id = req.authorizationId;

});

// 댓글 삭제
router.delete('/:contentId/replies/:replyId', (req, res) => {
    let id = req.authorizationId;
    let contentId = req.params.contentId;
    let replyId = req.params.replyId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT content_id
            FROM content_tbl
            WHERE content_id = ?
            AND deleted_at IS NULL
            AND is_public IS TRUE
            AND is_banned IS FALSE`, [contentId])
        .then((result) => {
            if (result.length === 0) {
                connection.release();
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            } else {
                 query(connection, res,
                   `SELECT content_id
                    FROM content_reply_tbl
                    WHERE reply_id = ?
                    AND user_id = ?
                    AND deleted_at IS NULL`, [replyId, id]) // 내가 쓴 댓글만 지울수 있다.
                 .then((replyResult) => {
                     if (replyResult.length === 0) {
                        connection.release();
                        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
                    } else {
                        query(connection, res,
                           `UPDATE content_reply_tbl SET deleted_at = NOW()
                            WHERE reply_id = ?`,[replyId])
                        .then((changeResult) => {
                            connection.release();
                            return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                        });
                    }
                });
            }
        });
    });
});

export default router;