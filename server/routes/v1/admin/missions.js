import express from 'express';
import multiparty from 'multiparty';
import _ from 'underscore';
import dateFormat from 'dateformat';
import { DB_ERROR, NO_DATA, SUCCESS, INVALID_REQUEST, SERVER_ERROR, EMAIL_REGEXP, PASSWORD_REGEXP, IS_MY_ID, query, dbConnect, resultArray, MISSION_TYPES, isValidDate, isSet, putObjectToS3 } from '../../../utils';

const router = express.Router();

// 오늘 포함 이후의 미션 전체 가져오기
router.get('/', (req, res) => {
    let type = req.query.type;

    dbConnect(res).then((connection) => {
        if ( type === "temp" ) { // 임시 미션
            query(connection, res,
               `SELECT t2.temp_mission_id, t2.mission, t2.mission_type, t2.creator_id, t2.creator_name, t2.updated_at, t2.created_at
                FROM temp_mission_tbl AS t2
                LEFT OUTER JOIN mission_tbl AS t1
                ON t1.temp_mission_id = t2.temp_mission_id
                WHERE t1.mission_id IS NULL
                ORDER BY t2.created_at ASC` )
            .then((missionSelectResult) => {
                connection.release();
                return res.status(200).json(
                    resultArray.toCamelCase(
                        SUCCESS,
                        {
                            missions: missionSelectResult
                        }
                    )
                );
            });
        } else if ( type === "fixed" ) { // 확정 미션
            query(connection, res,
               `SELECT *
                FROM mission_tbl
                WHERE mission_date >= DATE_FORMAT(NOW(), "%Y-%m-%d")
                ORDER BY mission_date ASC` )
            .then((missionSelectResult) => {
                connection.release();
                return res.status(200).json(
                    resultArray.toCamelCase(
                        SUCCESS,
                        {
                            missions: missionSelectResult
                        }
                    )
                );
            });
        }
    });
});

// 해당 미션 날짜에 이미 미션이 있는지 확인
router.get('/:tempMissionId/checking', (req, res) => {
    let missionDate = req.body.missionDate;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT *
            FROM mission_tbl
            WHERE mission_date = ?`, [missionDate])
        .then((missionSelectResult) => {
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

// 임시 미션 업로드
router.post('/', (req, res) => {
    let name = req.name;
    let adminId = req.authorizationId;

    let form = new multiparty.Form();

    form.parse(req, (err, fields, files) => {
        // let missionTypeNumber = req.body.missionType;

        // let mission = req.body.mission;

        let missionTypeNumber        = isSet(fields, "missionType");
        let mission                  = isSet(fields, "mission");
        let picture                  = isSet(files, "picture");

        // if ( mission === undefined || missionTypeNumber === undefined ) {
        //     return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
        // }

        console.log(missionTypeNumber);
        console.log(mission);
        console.log(picture);


        if ( mission === undefined ||
             missionTypeNumber === undefined ||
             picture === undefined ) {
            return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
        }

        if ( MISSION_TYPES[missionTypeNumber] === undefined ) {
            return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
        }

        dbConnect(res).then((connection) => {
            query(connection, res,
               `SELECT * FROM temp_mission_tbl WHERE JSON_CONTAINS(mission, JSON_OBJECT('text', ?)) = TRUE;`, [mission])
            .then((missionSelectResult) => {
                if ( missionSelectResult.length > 0 ) {
                    return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
                }


                let picturePath = _.isObject(picture) ? picture.path : picture;


                putObjectToS3(picturePath, '732-10th', `mission/pictures`, (uploadPath, err) => {
                    if ( err ) {
                        return res.status(500).json(resultArray.toCamelCase(SERVER_ERROR));
                    }

                    let missionType = MISSION_TYPES[missionTypeNumber];

                    let missionObject = {
                        picture : uploadPath
                    };

                    missionObject[missionType] = mission;

                    console.log(missionObject);
                    console.log(picture.path);

                    console.log(adminId);
                    console.log(name);

                    query(connection, res,
                       `INSERT INTO temp_mission_tbl(mission, mission_type, creator_id, creator_name)
                        VALUES(?, ?, ?, ?)`, [JSON.stringify(missionObject), missionTypeNumber, adminId, name])
                    .then((missionInsertResult) => {
                        connection.release();
                        return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                    });
                });
            });
        });
    });
});

// 임시 미션을 미션으로 승급 POST
router.post('/:tempMissionId/upgrade', (req, res) => {
    let name = req.name;
    let adminId = req.authorizationId;

    let missionDate = req.body.missionDate;

    let tempMissionId = req.params.tempMissionId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT * FROM temp_mission_tbl WHERE temp_mission_id = ?`, [tempMissionId])
        .then((missionSelectResult) => {
            if ( missionSelectResult.length !== 1 ) {
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }

            query(connection, res,
               `SELECT t1.date
                FROM date_tbl AS t1
                LEFT OUTER JOIN mission_tbl AS t2
                ON t1.date = t2.mission_date
                WHERE t2.mission_date IS NULL
                LIMIT 1`)
            .then((missionDateResult) => {
                if ( missionDateResult.length === 0 ) {
                    return res.status(400).json(
                        resultArray.toCamelCase(
                            {
                                meta: {
                                    code: -52,
                                    message: "올릴 날짜가 없어요."
                                }
                            }
                        )
                    );
                }
                missionDate = ( isValidDate(missionDate) ? missionDate : missionDateResult[0].date );

                query(connection, res,
                   `INSERT INTO mission_tbl(temp_mission_id, mission, mission_type, mission_date, upgrader_id, upgrader_name)
                    VALUES(?, ?, ?, ?, ?, ?)`, [tempMissionId, missionSelectResult[0].mission, missionSelectResult[0].mission_type, missionDate, adminId, name])
                .then((missionSelectResult) => {
                    connection.release();
                    return res.status(200).json(resultArray.toCamelCase(SUCCESS));
                });
            });
        });
    });
});

// 임시 미션을 미션으로 승급 PUT
router.put('/:tempMissionId/upgrade', (req, res) => {
    let name = req.name;
    let adminId = req.authorizationId;

    let missionDate = req.body.missionDate;

    if ( missionDate === undefined || !isValidDate(missionDate) ) {
        return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
    }

    let tempMissionId = req.params.tempMissionId;

    dbConnect(res).then((connection) => {
        query(connection, res,
           `SELECT * FROM temp_mission_tbl WHERE temp_mission_id = ?`, [tempMissionId])
        .then((missionSelectResult) => {
            if ( missionSelectResult.length !== 1 ) {
                return res.status(400).json(resultArray.toCamelCase(INVALID_REQUEST));
            }

            query(connection, res,
               `UPDATE mission_tbl
                SET temp_mission_id = ?, mission = ?, mission_type = ?, upgrader_id = ?, upgrader_name = ?
                WHERE mission_date = ?`, [tempMissionId, missionSelectResult[0].mission, missionSelectResult[0].mission_type, adminId, name, missionDate])
            .then((missionSelectResult) => {
                connection.release();
                return res.status(200).json(resultArray.toCamelCase(SUCCESS));
            });
        });
    });
});



// 미션의 컨텐츠들
router.get('/:missionId/contents', (req, res) => {

});

export default router;