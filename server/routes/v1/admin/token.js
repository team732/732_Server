import express from 'express';
import multiparty from 'multiparty';
import _ from 'underscore';
import dateFormat from 'dateformat';
import jwt from 'jsonwebtoken';
import { ADMIN_TOKEN_KEY, SALT_ROUNDS } from '../../../main';
import { dbConnect, query, resultArray, randomString, SUCCESS, INVALID_REQUEST, SERVER_ERROR, EMAIL_REGEXP, LOGIN_ID_REGEXP, ADMIN_LOGIN_EXPIRY_TIME } from '../../../utils';

const router = express.Router();
router.get('/', (req, res) => {
    let authorization = req.headers.authorization;
    dbConnect(res).then((connection) => {
        try{
            let decoded = jwt.verify(authorization, ADMIN_TOKEN_KEY);
            query(connection, res, `INSERT INTO invalid_token_tbl(invalid_token, expired_to) VALUES(?, FROM_UNIXTIME(?))`, [authorization, decoded.exp])
            .then((insertResult) => {

                let payLoad = { userId : decoded.userId, name:decoded.name };
                let token = jwt.sign(payLoad, ADMIN_TOKEN_KEY,{
                    algorithm : 'HS256', //"HS256", "HS384", "HS512", "RS256", "RS384", "RS512" default SHA256
                    expiresIn : ADMIN_LOGIN_EXPIRY_TIME // 5 days
                });

                connection.release();
                return res.json(
                    resultArray.toCamelCase(
                        SUCCESS,
                        {
                            token : token
                        }
                    )
                );

            });
        } catch(err){
            connection.release();
            return res.status(401).json(
                resultArray.toCamelCase(
                    {
                        meta: {
                            code: -3,
                            message: "로그인 해주세요."
                        }
                    }
                )
            );
        }
    });
});

export default router;