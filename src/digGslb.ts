/* eslint-disable prefer-const */



'use strict';


import { GslbApp, GtmConfObj } from "./models";
import { gtmRecordTypes } from "./objCounter";
import { RegExTree } from "./regex";
import { deepmergeInto } from "deepmerge-ts";




export class DigGslb {
    gtm: GtmConfObj;
    /**
     * this probably needs to be paired down to just the gtm rx we need like the input object
     */
    rx: RegExTree["gtm"];

    gtmRecordTypes = gtmRecordTypes;

    apps: GslbApp[] = [];

    // bring in the whole bigip config object since we don't have typing for just the gtm portion
    constructor(gtm: GtmConfObj, rx: RegExTree["gtm"]) {
        this.gtm = gtm;
        this.rx = rx;
    }

    async fqdns(app?: string): Promise<GslbApp[]> {

        // if (Object.keys(this.gtm?.wideip).length > 0) {
        //     return [];
        // }

        if (app) {

            // dig out single fqdn

        } else {

            gtmRecordTypes.forEach(type => {

                // make sure we have this object
                if (this.gtm?.wideip?.[type]) {

                    // loop through the object
                    for (const [key, value] of Object.entries(this.gtm.wideip?.[type])) {

                        let v = value as any;   // dangerious to cast any, but only way to get it working
                        let k = key as string;
                        const originalCfg = `gtm wideip ${type} ${k} {${v.line}}`

                        // clone the app config
                        const tmpObj = JSON.parse(JSON.stringify(v));

                        // move and recrate the original config line
                        delete tmpObj.line;
                        tmpObj.lines = [ originalCfg ];
                        // Set fqdn from the key (extract just the name part from /Partition/name)
                        tmpObj.fqdn = k.split('/').pop() || k;
                        // Set the record type
                        tmpObj.type = type;

                        // Convert aliases from object to array if present
                        if (tmpObj.aliases && typeof tmpObj.aliases === 'object') {
                            tmpObj.aliases = Object.keys(tmpObj.aliases).filter(a => a !== 'line');
                        }

                        const appObj = tmpObj as GslbApp;
                        appObj.allPossibleDestinations = [];

                        // if we have iRules, try to parse them for responses/pool/destinations
                        if(appObj.iRules) {
                            // todo:  loop through each irule associated and dig out details
                            // add possible destinations or resposnes to the allPossibleDestinations array
                        }

                        if(appObj.pools) {

                            // dig each pool reference, replacing as we go
                            // pools is now an object with pool names as keys
                            for (const [poolName, poolRefData] of Object.entries(appObj.pools)) {
                                // Skip the 'line' property that contains the raw config
                                if (poolName === 'line') continue;

                                const poolRef = poolRefData as any;
                                poolRef.name = poolName;  // Add name property for compatibility

                                // copy full pool details
                                const poolConfig = this.gtm.pool?.[appObj.type]?.[poolName];
                                if (!poolConfig) continue;

                                const poolDetails = JSON.parse(JSON.stringify(poolConfig));
                                const originalLine = `gtm pool ${poolDetails.type || appObj.type} ${poolName} { ${poolDetails.line || ''} }`;
                                appObj.lines.push(originalLine)
                                delete poolDetails.line;

                                if(poolDetails['fallback-ip']) {
                                    appObj.allPossibleDestinations.push(poolDetails['fallback-ip'])
                                }

                                if(poolDetails.members) {
                                    // members is now an object with member names as keys
                                    for (const [memberName, memberData] of Object.entries(poolDetails.members)) {
                                        if (memberName === 'line') continue;

                                        const e = memberData as any;
                                        const serverDetails = this.gtm.server?.[e.server];
                                        if (!serverDetails) continue;

                                        const originalLine = `gtm server ${e.server} { ${serverDetails.line || ''} }`;
                                        const vServer = serverDetails['virtual-servers']?.[e.vs];
                                        if (!vServer) continue;

                                        const tPort = vServer["translation-port"] ? vServer["translation-port"] : '';
                                        const tAddress = vServer["translation-address"] ? vServer["translation-address"] : '';
                                        const tAddressPort = tPort ? `${tAddress}:${tPort}` : tAddress;
                                        const dest = tAddress ? `${vServer.destination}->NAT->${tAddressPort}` : vServer.destination

                                        appObj.allPossibleDestinations.push(dest)
                                        appObj.lines.push(originalLine);
                                        deepmergeInto(e, vServer);
                                    }
                                }

                                deepmergeInto(poolRef, poolDetails)

                            }
                        }

                        this.apps.push(appObj)
                    }
                }
            })

        }
        return this.apps;
    }

}

