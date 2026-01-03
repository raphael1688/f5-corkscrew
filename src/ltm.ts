'use strict';

import { EventEmitter } from 'events';
import { RegExTree } from './regex'
import logger from './logger';
import { BigipConfObj, ConfigFile, Explosion, License, Stats, TmosApp, AppsFilterOptions, AppSummary } from './models'
import { v4 as uuidv4 } from 'uuid';
import { countObjects } from './objCounter';
import { digVsConfig, getHostname } from './digConfigs';
import path from 'path';
import { UnPacker } from './unPackerStream';
import { digDoConfig } from './digDoClassesAuto';
import { DigGslb } from './digGslb';
import { deepmergeInto } from 'deepmerge-ts';
import XmlStats from './xmlStats';
import { parseConfig } from './universalParse';

// Re-export types for convenience
export { AppsFilterOptions, AppSummary };

/**
 * Class to consume bigip configs -> parse apps + gather stats
 * 
 */
export default class BigipConfig extends EventEmitter {
    /**
     * incoming config files array
     * ex. [{filename:'config/bigip.conf',size:12345,content:'...'},{...}]
     */
    configFiles: ConfigFile[] = [];
    /**
     * tmos config as nested json objects 
     * - consolidated parant object keys like ltm/apm/sys/...
     */
    configObject: BigipConfObj = {};
    /**
     * tmos version of the config file
     */
    tmosVersion: string | undefined;
    /**
     * hostname of the source device
     */
    hostname: string | undefined;
    /**
     * input file type (.conf/.ucs/.qkview/.tar.gz)
     */
    inputFileType: string;
    /**
     * tmos version specific regex tree for abstracting applications
     */
    rx: RegExTree | undefined;
    /**
     * corkscrew processing stats object
     */
    stats: Stats = {
        objectCount: 0,
    };
    /**
     * stats information extracted from qkview xml files
     */
    xmlStats = new XmlStats();
    /**
     * default profile settings
     */
    defaultProfileBase: ConfigFile;
    /**
     * default low (system) profile settings
     */
    defaultLowProfileBase: ConfigFile;
    /**
     * bigip license file
     */
    license: License;
    /**
     * tmos file store files, which include certs/keys/external_monitors/...
     */
    fileStore: ConfigFile[] = [];

    constructor() {
        super();
    }

    /**
     * Load and parse TMOS configuration from a string
     * 
     * @param configText - Raw TMOS configuration text
     * @param fileName - Optional filename for reference (default: 'string-input.conf')
     * @returns Parse time in milliseconds
     * 
     * @example
     * ```typescript
     * const bigip = new BigipConfig();
     * await bigip.loadParseString(tmosConfigText);
     * const apps = await bigip.apps();
     * ```
     */
    async loadParseString(configText: string, fileName: string = 'string-input.conf'): Promise<number> {
        const startTime = process.hrtime.bigint();
        
        this.inputFileType = '.conf';
        
        // Create a ConfigFile object from the string
        const conf: ConfigFile = {
            fileName,
            size: configText.length,
            content: configText
        };

        // Parse the config
        await this.parseConf(conf);

        // Get object counts
        this.stats.objects = await countObjects(this.configObject);

        // Get hostname
        this.hostname = getHostname(this.configObject);

        // Assign tmos version to stats
        this.stats.sourceTmosVersion = this.tmosVersion;

        // Calculate parse time
        this.stats.parseTime = Number(process.hrtime.bigint() - startTime) / 1000000;

        return this.stats.parseTime;
    }

    /**
     * Load and parse TMOS configuration from a file
     * 
     * @param file bigip .conf/ucs/qkview/mini_ucs.tar.gz
     */
    async loadParseAsync(file: string): Promise<number> {
        const startTime = process.hrtime.bigint();
        // capture incoming file type
        this.inputFileType = path.parse(file).ext;

        const parseConfPromises = [];
        const parseStatPromises = [];
        const unPacker = new UnPacker();

        unPacker.on('conf', conf => {
            // parse .conf files, capture promises
            parseConfPromises.push(this.parseConf(conf))
        })
        unPacker.on('stat', conf => {
            // parse stats files async since they are going to thier own tree
            parseStatPromises.push(
                this.xmlStats.load(conf)
                    .catch((err) => {
                        logger.error('xmlStats file parsing error: ', err);
                    })
            )
        })

        await unPacker.stream(file)
            .then(async x => {

                // we don't get x, if we only process a single conf file
                if (x) {

                    this.stats.sourceSize = x.size;

                    // wait for all the parse config promises to finish
                    await Promise.all(parseConfPromises)

                    // then parse all the other non-conf files
                    this.parseExtras(x.files)
                }
            })

        // wait for all the stats files processing promises to finish
        await Promise.all(parseStatPromises)

        // if inputFileType is .qkview, then crunch the stats
        if (this.inputFileType === '.qkview') {
            await this.xmlStats.crunch()
                .catch((err) => {
                    logger.error('xmlStats crunch error - failed to process stats', err);
                });
        }

        // get ltm/gtm/apm/asm object counts
        this.stats.objects = await countObjects(this.configObject)

        // assign souceTmosVersion to stats object also
        this.stats.sourceTmosVersion = this.tmosVersion

        // get hostname to show in vscode extension view
        this.hostname = getHostname(this.configObject);

        // end processing time, convert microseconds to miliseconds
        this.stats.parseTime = Number(process.hrtime.bigint() - startTime) / 1000000;

        return this.stats.parseTime;
    }


    /**
     * Parse config file using universal parser
     */
    async parseConf(conf: ConfigFile): Promise<void> {

        if (
            conf.fileName === 'config/profile_base.conf' ||
            conf.fileName === 'config/low_profile_base.conf'
        ) {
            logger.info(`${conf.fileName}: default profile base file, stashing for later`)
            this.defaultProfileBase = conf;
            this.defaultLowProfileBase = conf;
            return
        }

        this.emit('parseFile', conf.fileName)

        conf.content = conf.content.replace(/\r\n/g, '\n')

        this.configFiles.push(conf)

        // Set tmos version if not already set
        if (!this.rx) {
            await this.setTmosVersion(conf)
        } else {
            this.setTmosVersion(conf)
        }

        // Use universal parser
        try {
            const parsed = parseConfig(conf.content);
            
            // Count objects for stats
            const objectCount = this.countParsedObjects(parsed);
            this.stats.objectCount = (this.stats.objectCount || 0) + objectCount;

            // Emit progress events
            this.emit('parseObject', {
                parsing: conf.fileName,
                num: objectCount,
                of: objectCount
            });

            // Merge into main config object
            deepmergeInto(this.configObject, parsed);

        } catch (err) {
            logger.error(`Failed to parse ${conf.fileName}:`, err);
        }
    }

    /**
     * Count objects in parsed config (recursive)
     */
    private countParsedObjects(obj: any, depth: number = 0): number {
        if (!obj || typeof obj !== 'object') return 0;
        
        let count = 0;
        for (const key of Object.keys(obj)) {
            if (depth < 3) {
                count += this.countParsedObjects(obj[key], depth + 1);
            } else {
                count += 1;
            }
        }
        return count;
    }



    async parseExtras(files: ConfigFile[]): Promise<void> {
        // take in list of files (non-conf)


        for await (const file of files) {

            this.emit('parseFile', file.fileName)

            if (file.fileName.includes('license')) {
                this.license = file;

                const rx = /^([\w ]+) : +([\S ]+)$/gm;
                const matches = file.content.match(rx);

                matches.forEach(el => {
                    const [k, v] = el.split(/ : +/);
                    if (k && v) {
                        this.license[k] = v;
                    }
                });
            }

            if (file.fileName.includes('/filestore')) {
                this.fileStore.push(file);
            }
        }
        return;

    }

    /**
     * parses config file for tmos version, sets tmos version specific regex tree used to parse applications
     * @param x config-file object
     */
    async setTmosVersion(x: ConfigFile): Promise<void> {
        if (this.rx) {
            // rex tree already assigned, lets confirm subsequent file tmos version match
            if (this.tmosVersion === this.rx.getTMOSversion(x.content)) {
                // do nothing, current file version matches existing files tmos verion
            } else {
                const err = `Parsing [${x.fileName}], tmos version of this file does not match previous file [${this.tmosVersion}]`;
                logger.error(err)
            }
        } else {

            // first time through - build everything
            this.rx = new RegExTree(x.content);
            this.tmosVersion = this.rx.tmosVersion;
            logger.info(`Recieved .conf file of version: ${this.tmosVersion}`)
        }
    }


    /**
     * List all unique partitions found in the configuration
     * 
     * @returns Array of partition names
     * 
     * @example
     * ```typescript
     * const partitions = bigip.listPartitions();
     * // ['Common', 'Tenant1', 'Tenant2']
     * ```
     */
    listPartitions(): string[] {
        const partitions = new Set<string>();

        // Helper to extract partition from object keys
        const extractPartitions = (obj: Record<string, any> | undefined) => {
            if (!obj) return;
            for (const key of Object.keys(obj)) {
                // Keys are full paths like "/Common/pool1" or "/Tenant1/app1"
                const match = key.match(/^\/([^/]+)\//);
                if (match && match[1]) {
                    partitions.add(match[1]);
                }
            }
        };

        // Check LTM objects
        if (this.configObject.ltm) {
            extractPartitions(this.configObject.ltm.virtual);
            extractPartitions(this.configObject.ltm.pool);
            extractPartitions(this.configObject.ltm.node);
            extractPartitions(this.configObject.ltm.rule);
            extractPartitions(this.configObject.ltm.policy);
            extractPartitions(this.configObject.ltm.snatpool);
            
            // Profiles and monitors have an extra level
            if (this.configObject.ltm.profile) {
                for (const profileType of Object.values(this.configObject.ltm.profile)) {
                    extractPartitions(profileType as Record<string, any>);
                }
            }
            if (this.configObject.ltm.monitor) {
                for (const monitorType of Object.values(this.configObject.ltm.monitor)) {
                    extractPartitions(monitorType as Record<string, any>);
                }
            }
        }

        // Check GTM objects
        if (this.configObject.gtm) {
            extractPartitions(this.configObject.gtm.server);
            if (this.configObject.gtm.pool) {
                for (const poolType of Object.values(this.configObject.gtm.pool)) {
                    extractPartitions(poolType as Record<string, any>);
                }
            }
            if (this.configObject.gtm.wideip) {
                for (const wipType of Object.values(this.configObject.gtm.wideip)) {
                    extractPartitions(wipType as Record<string, any>);
                }
            }
        }

        // Check APM
        if (this.configObject.apm?.profile?.access) {
            extractPartitions(this.configObject.apm.profile.access);
        }

        // Check ASM
        if (this.configObject.asm?.policy) {
            extractPartitions(this.configObject.asm.policy);
        }

        return Array.from(partitions).sort();
    }

    /**
     * List all virtual servers (apps) in the configuration
     * 
     * @param partition - Optional: filter by partition name
     * @returns Array of virtual server full paths
     * 
     * @example
     * ```typescript
     * // List all apps
     * const allApps = bigip.listApps();
     * // ['/Common/app1_vs', '/Common/app2_vs', '/Tenant1/app3_vs']
     * 
     * // List apps in specific partition
     * const tenant1Apps = bigip.listApps('Tenant1');
     * // ['/Tenant1/app3_vs']
     * ```
     */
    listApps(partition?: string): string[] {
        const virtuals = this.configObject.ltm?.virtual;
        if (!virtuals) return [];

        let apps = Object.keys(virtuals);

        if (partition) {
            apps = apps.filter(app => {
                const match = app.match(/^\/([^/]+)\//);
                return match && match[1] === partition;
            });
        }

        return apps.sort();
    }

    /**
     * Get summary information for apps (lightweight listing)
     * 
     * @param partition - Optional: filter by partition name
     * @returns Array of app summaries
     */
    listAppsSummary(partition?: string): AppSummary[] {
        const virtuals = this.configObject.ltm?.virtual;
        if (!virtuals) return [];

        const summaries: AppSummary[] = [];

        for (const [fullPath, vs] of Object.entries(virtuals)) {
            // Apply partition filter if specified
            if (partition) {
                const match = fullPath.match(/^\/([^/]+)\//);
                if (!match || match[1] !== partition) continue;
            }

            const summary: AppSummary = {
                name: vs.name || fullPath.split('/').pop() || fullPath,
                fullPath,
                partition: vs.partition || 'Common',
                destination: vs.destination,
                pool: vs.pool
            };

            if (vs.folder) {
                summary.folder = vs.folder;
            }

            summaries.push(summary);
        }

        return summaries.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    }

    /**
     * Return list of application names (legacy method)
     * 
     * @return array of app names
     * @example ['/Common/app1_80t_vs', '/tenant1/app4_t443_vs']
     */
    async appList(): Promise<string[]> {
        return this.listApps();
    }

    /**
     * returns all details from processing
     */
    async explode(): Promise<Explosion> {

        // extract apps before pack timer...
        const apps = await this.apps()
            .catch((err) => {
                logger.error('explode apps error', err);
            });

        // extract all the dns apps/fqdns
        const fqdns = await this.digGslb()
            .catch((err) => {
                logger.error('explode gslb error', err);
            });

        const startTime = process.hrtime.bigint();  // start pack timer

        // extract DO classes (base information expanded)
        const doClasses = await digDoConfig(this.configObject)
            .catch((err) => {
                logger.error('extract DO classes error', err);
            });

        // build return object
        const retObj = {
            id: uuidv4(),
            dateTime: new Date(),
            hostname: this.hostname,
            inputFileType: this.inputFileType,
            config: {
                sources: this.configFiles,
            },
            baseRegKey: this.license?.['Registration Key'],
            stats: this.stats,
            logs: await this.logs()
        }

        if (doClasses) {
            retObj.config['doClasses'] = doClasses;
        }

        if (apps && apps.length > 0) {
            retObj.config['apps'] = apps;
        }

        if (fqdns) {
            retObj.config['gslb'] = fqdns;
        }

        if (this.fileStore.length > 0) {
            retObj['fileStore'] = this.fileStore;
        }

        // capture pack time
        this.stats.packTime = Number(process.hrtime.bigint() - startTime) / 1000000;

        return retObj
    }

    /**
     * Get processing logs
     */
    async logs(): Promise<string[]> {
        return logger.getLogs();
    }

    async digGslb(fqdn?: string) {

        const startTime = process.hrtime.bigint();

        const apps = [];

        const dg = new DigGslb(this.configObject.gtm, this.rx.gtm);

        await dg.fqdns(fqdn).then(fs => {
            apps.push(...fs);
        })

        this.stats.fqdnTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        return apps;
    }


    /**
     * Extract LTM applications with optional filtering
     * 
     * @param options - Filter options (partition, partitions, apps, or single app name for backward compat)
     * @returns Array of extracted applications
     * 
     * @example
     * ```typescript
     * // Extract all apps
     * const allApps = await bigip.apps();
     * 
     * // Extract apps from specific partition
     * const tenant1Apps = await bigip.apps({ partition: 'Tenant1' });
     * 
     * // Extract apps from multiple partitions
     * const multiApps = await bigip.apps({ partitions: ['Tenant1', 'Tenant2'] });
     * 
     * // Extract specific apps by name
     * const specificApps = await bigip.apps({ 
     *     apps: ['/Common/app1_vs', '/Tenant1/app3_vs'] 
     * });
     * 
     * // Legacy: single app by name (backward compatible)
     * const singleApp = await bigip.apps('/Common/app1_vs');
     * ```
     */
    async apps(options?: string | AppsFilterOptions): Promise<TmosApp[]> {

        const startTime = process.hrtime.bigint();

        // Handle legacy single app string argument
        if (typeof options === 'string') {
            const app = options;
            const value = this.configObject.ltm?.virtual?.[app];

            this.emit('extractApp', {
                app,
                time: Number(process.hrtime.bigint() - startTime) / 1000000
            });

            if (value) {
                const x = [await digVsConfig(app, value, this.configObject, this.rx)];
                this.stats.appTime = Number(process.hrtime.bigint() - startTime) / 1000000;
                return x;
            }
            return [];
        }

        // No virtuals found
        if (!this.configObject.ltm?.virtual || Object.keys(this.configObject.ltm.virtual).length === 0) {
            logger.info('no ltm virtual servers found - excluding apps information');
            return [];
        }

        // Build list of apps to extract based on filters
        let appsToExtract: string[];

        if (options?.apps && options.apps.length > 0) {
            // Specific apps requested
            appsToExtract = options.apps.filter(app => 
                this.configObject.ltm?.virtual?.[app] !== undefined
            );
        } else if (options?.partition || options?.partitions) {
            // Partition filter
            const partitions = options.partitions || [options.partition!];
            appsToExtract = Object.keys(this.configObject.ltm.virtual).filter(app => {
                const match = app.match(/^\/([^/]+)\//);
                return match && partitions.includes(match[1]);
            });
        } else {
            // All apps
            appsToExtract = Object.keys(this.configObject.ltm.virtual);
        }

        // Extract each app
        const apps: TmosApp[] = [];

        for (const key of appsToExtract) {
            const value = this.configObject.ltm.virtual[key];
            
            this.emit('extractApp', {
                app: key,
                time: Number(process.hrtime.bigint() - startTime) / 1000000
            });

            await digVsConfig(key, value, this.configObject, this.rx)
                .then(vsApp => {
                    apps.push(vsApp);
                })
                .catch(err => {
                    logger.error(`corkscrew: problem abstracting app/vs ${key}`, err);
                });
        }

        this.stats.appTime = Number(process.hrtime.bigint() - startTime) / 1000000;
        return apps;
    }
}
