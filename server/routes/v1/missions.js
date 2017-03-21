import express from 'express';
import multiparty from 'multiparty';
import _ from 'underscore';
import dateFormat from 'dateformat';
import { DB_ERROR, NO_DATA, SUCCESS, INVALID_REQUEST, SERVER_ERROR, EMAIL_REGEXP, PASSWORD_REGEXP, IS_MY_ID, query, dbConnect, resultArray, isSet, putObjectToS3 } from '../../utils';

const router = express.Router();

// 글 올리기
router.post('/:missionId/contents', (req, res) => {
    let userId = req.authorizationId;
    let missionId = req.params.missionId;

    let form = new multiparty.Form();

    form.parse(req, (err, fields, files) => {
        // let userMissionId = isSet(fields, "userMissionId");
        let text          = isSet(fields, "text");
        let isPublic      = isSet(fields, "isPublic");
        let photo         = isSet(files, "photo");

        // photo = photo === undefined ? DEFAULT_USER_IMG : photo;
        // return res.json(files);

        if ( text === undefined ||
             isPublic === undefined ||
             photo === undefined ) {
            return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
        }

        if ( text !== "" && (140 < text.trim().length || text.trim().length < 1) ) {
            return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
        }

        isPublic = isPublic === "true" ? true : false;

        dbConnect(res).then((connection) => {
            query(connection, res,
               `SELECT content_id
                FROM content_tbl
                WHERE user_id = ?
                AND mission_id = ?
                AND is_public = true
                AND is_banned = false
                AND deleted_at IS NULL`,
                [Number(userId), Number(missionId)])
            .then((userMissionResult) => {
                if ( userMissionResult.length > 2 && Boolean(isPublic) === true ) { // 해당 미션에 이미 공개된 게시글이 3개 이상 있는경우
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

                let photoPath = _.isObject(photo) ? photo.path : photo;

                let now = new Date();
                let year = dateFormat(now, "yyyy");
                let month = dateFormat(now, "mm");
                let day = dateFormat(now, "dd");

                putObjectToS3(photoPath, '732-10th', `contents/${year}-${month}-${day}/missionId-${missionId}`, (uploadPath, err) => {
                    if ( err ) {
                        connection.release();
                        return res.status(500).json(resultArray.toCamelCase(SERVER_ERROR));
                    }

                    let content = {
                        text : text,
                        picture : uploadPath
                    };

                    query(connection, res,
                       `INSERT INTO content_tbl(content, user_id, mission_id, is_public)
                        VALUES(?, ?, ?, ?)`,
                        [JSON.stringify(content), Number(userId), Number(missionId), Boolean(isPublic)])
                    .then((contentInsertResult) => {
                        connection.release();
                        return res.status(201).json(resultArray.toCamelCase(SUCCESS));
                    });
                });
            });
        });
    });
});

// 오늘 이전의 미션 목록
router.get('/', (req, res) => {
    let offset = req.query.offset;
    let limit = req.query.limit;

    if(offset === undefined || isNaN(offset) === true){
        offset = 0;
    }

    if(limit === undefined || isNaN(limit) === true){
        limit = 30;
    }

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%Y년 %c월 %e일") AS mission_date
            FROM mission_tbl
            WHERE DATE_FORMAT(DATE_ADD(mission_tbl.mission_date, INTERVAL -450 MINUTE), "%Y-%m-%d") < DATE_FORMAT(DATE_ADD(NOW(), INTERVAL -450 MINUTE), "%Y-%m-%d")
            ORDER BY mission_tbl.mission_date DESC
            LIMIT ? OFFSET ?`, [Number(limit), Number(offset)])
        .then((result) => {

            query(connection, res,
               `SELECT COUNT(mission_id) AS count
                FROM mission_tbl
                WHERE mission_date < DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")`)
            .then((countResult) => {
                let currentUrl = `${req.protocol}://${req.get('host') + (req.path.length === 1 ? req.baseUrl : req.baseUrl + req.path)}`;

                let offsetUrl = `&offset=${( result.length === 0 ? offset : Number( offset ) + Number( limit ) )}`;
                let nextUrl = `${currentUrl}?limit=${Number(limit) + offsetUrl}`;

                connection.release();
                return res.status(200).json(
                    resultArray.toCamelCase(
                        SUCCESS,
                        {
                            missionsCount: countResult[0].count,
                            missions: result
                        },
                        nextUrl
                    )
                );
            });
        });
    });
});

// 해당 미션의 컨텐츠 목록
router.get('/:missionId/contents', (req, res) => {
    let userId = req.authorizationId;

    let missionId = req.params.missionId;
    let sort = req.query.sort;

    let offset = req.query.offset;
    let limit = req.query.limit;

    let sortQuery = "";
    let sortUrl = "";

    let lastContentId = req.query.lastContentId;

    let lastContentQuery = "";
    let queryArr = [];

    if(lastContentId === undefined || isNaN(lastContentId) === true){
        lastContentId = 2100000000;
    }

    if(offset === undefined || isNaN(offset) === true){
        offset = 0;
    }

    if(limit === undefined || isNaN(limit) === true){
        limit = 30;
    }


    if ( sort === '-created_at' ) { // 최신순
        lastContentQuery = `AND t1.content_id < ?`;
        sortQuery = `ORDER BY v1.created_at DESC, v1.content_id DESC
                     LIMIT ?`;
        sortUrl = '&sort=-created_at&lastContentId=';
        queryArr.push(Number(missionId));
        queryArr.push(Number(lastContentId));
        queryArr.push(Number(limit));
    } else if ( sort === '-like_count' ) { // 인기순
        sortQuery = `ORDER BY like_count DESC, v1.created_at ASC
                    LIMIT ? OFFSET ?`
        sortUrl = '&sort=-like_count';
        queryArr.push(Number(missionId));
        queryArr.push(Number(limit));
        queryArr.push(Number(offset));
    } else { // 그외 이상한 데이터 들어오면 최신순
        lastContentQuery = `AND t1.content_id < ?`;
        sortQuery = `ORDER BY v1.created_at DESC, v1.content_id DESC
                     LIMIT ?`;
        sortUrl = '&sort=-created_at&lastContentId=';
        queryArr.push(Number(missionId));
        queryArr.push(Number(lastContentId));
        queryArr.push(Number(limit));
    }

    // if ( missionDate === undefined ) { // missionDate 없으면 오늘날짜
    //     let now = new Date();
    //     missionDate = dateFormat(now, "yyyy-mm-dd");
    // }

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
                    WHERE t2.mission_id = ?
                    ${lastContentQuery}
                    AND t1.is_public = TRUE
                    AND t1.is_banned = FALSE
                    AND t1.deleted_at IS NULL ) AS u1
                INNER JOIN user_tbl AS u2
                ON u1.user_id = u2.user_id ) v1
            LEFT OUTER JOIN content_like_tbl AS v2
            ON v1.content_id = v2.content_id
            GROUP BY v1.content_id
            HAVING like_count >= 0
            ${sortQuery}`, queryArr) // 공개되어있고 차단당하지 않았고 삭제되지 않은 오늘날짜의 미션 게시글 가져옴
        .then((selectResult) => {
            query(connection, res,
               `SELECT COUNT(t1.content_id) AS count
                FROM content_tbl AS t1
                INNER JOIN mission_tbl AS t2
                ON t1.mission_id = t2.mission_id
                WHERE t2.mission_id = ?
                AND t1.is_public = TRUE
                AND t1.is_banned = FALSE
                AND t1.deleted_at IS NULL`, [missionId]) // 공개되어있고 차단당하지 않았고 삭제되지 않은 오늘날짜의 미션 게시글 갯수를 가져옴
            .then((countResult) => {


                if ( sort !== '-like_count' ) {
                    let newLastContentId = selectResult.length === 0 ? 0 : selectResult[selectResult.length-1].content_id;
                    sortUrl += newLastContentId;
                }

                let currentUrl = `${req.protocol}://${req.get('host') + (req.path.length === 1 ? req.baseUrl : req.baseUrl + req.path)}`;

                let offsetUrl = `&offset=${( selectResult.length === 0 ? offset : Number( offset ) + Number( limit ) )}`;
                let nextUrl = `${currentUrl}?limit=${Number(limit) + offsetUrl + sortUrl}`;

                // connection.release();
                // console.log(selectResult);
                // console.log(toCamelCase(selectResult));
                // return res.status(200).json(
                //     resultArray.toCamelCase(selectResult)
                // );

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

// 오늘의 미션
router.get('/today', (req, res) => {
    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT mission_id, mission, mission_type, DATE_FORMAT(mission_date, "%Y년 %c월 %e일") AS mission_date
            FROM mission_tbl
            WHERE mission_tbl.mission_date <= DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
            ORDER BY mission_tbl.mission_date DESC
            LIMIT 1`)
        .then((selectResult) => {
            connection.release();

            if ( selectResult.length === 0 ) {
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }
            return res.status(200).json(
                resultArray.toCamelCase(
                    SUCCESS,
                    {
                        mission: selectResult[0]
                    }
                )
            );
        });
    });
});

export default router;