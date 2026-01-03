
import logger from "./logger";
import { BigipConfObj } from "./models";


export type RetObj = {
    path?: string,
    key?: string,
    value?: { line: string; };
}




/**
 * searches object for key
 * 
 * *** todo: update path to be array, not dot(.) notation
 *  - pretty sure this is complete...
 * 
 * @param obj to search
 * @param key to find
 * @param return [{ path: string, key: string, value: string }]
 */
export function pathValueFromKey(obj: unknown, key: string): RetObj {

    const results: RetObj[] = [];

    const objType = typeof obj;
    if (objType !== "object") {
        logger.error(`findValueFromKey function expected object, got: ${objType}`);
        return;
    }

    /**
     * iterate through json tree looking for key match
     */
    function findKey(obj: BigipConfObj, key: string, path?: string) {

        /**
         * if the current object we are on has the key we are looking for,
         * push result details
         * 
         */
        if (obj.hasOwnProperty(key)) {
            results.push({
                path,
                key,
                value: obj[key]
            })
        }

        /**
         * append path as we iterate
         */
        path = `${path ? path + "." : ""}`;

        for (const k in obj) {
            if (obj.hasOwnProperty(k)) {
                if (obj[k] && typeof obj[k] === "object") {
                    findKey(obj[k], key, `${path}${k}`);
                }
            }
        }
    }

    // call functoin to start iteration
    findKey(obj, key)

    if (results.length = 1) {
        // return array of results
        return results[0];
    }

}


