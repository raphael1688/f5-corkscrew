/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */

'use strict';

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import BigipConfig from '../src/ltm';
import { logOutput } from './explosionOutput';
import { archiveMake } from './archive_generator/archiveBuilder';
import { Explosion } from '../src/models';

let device: BigipConfig;
const log: any[] = [];
let err;
let expld: Explosion;
const parsedFileEvents: any[] = [];
const parsedObjEvents: any[] = [];
const extractAppEvents: any[] = [];
let testFile = '';
let outFile = '';

describe('bigip.conf tests', async function () {

    before(async () => {
        testFile = await archiveMake('conf') as string;
        const testFileDetails = path.parse(testFile);
        outFile = path.join(testFileDetails.dir, `${testFileDetails.base}.log`);
        console.log('test file: ', __filename);
        console.log('outFile', outFile);
    })

    it(`instantiate class, load configs`, async function () {
        device = new BigipConfig();

        device.on('parseFile', x => parsedFileEvents.push(x))
        device.on('parseObject', x => parsedObjEvents.push(x))
        device.on('extractApp', x => extractAppEvents.push(x))

        await device.loadParseAsync(testFile)
            .then(resp => {
                assert.ok(resp);
            })
            .catch(async err => {
                log.push(...await device.logs());
            })

    });

    it(`parse configs, get parseTime`, async function () {


        await device.explode()
            .then(expld => {
                fs.writeFileSync(`${outFile}.json`, JSON.stringify(expld, undefined, 4));
                const bigLog = logOutput(device.configObject, expld);
                fs.writeFileSync(outFile, bigLog);
            })
            .catch(async err => {
                log.push(...await device.logs());
                debugger;
            });

    });

    it(`check parseFile event`, async function () {

        assert.deepStrictEqual(parsedFileEvents[0], 'f5_corkscrew_test.conf')

    });


    it(`check parseObject event`, async function () {

        assert.ok(parsedObjEvents[0].num, 'should have a "num" param')
        assert.ok(parsedObjEvents[0].of, 'should have a "of" param')
        assert.ok(parsedObjEvents[0].parsing, 'should have a "parsing" param')
        assert.ok(typeof parsedObjEvents[0].num === "number", '"num" param should be a number')
        assert.ok(typeof parsedObjEvents[0].of === "number", '"of" param should be a number')
        assert.ok(typeof parsedObjEvents[0].parsing === "string", '"parsing" param should be a string')

    });


    it(`check extractApp event`, async function () {

        assert.ok(extractAppEvents[0].app, 'should have a "app" param')
        assert.ok(extractAppEvents[0].time, 'should have a "time" param')
        assert.ok(typeof extractAppEvents[0].app === "string", '"app" param should be a string')
        assert.ok(typeof extractAppEvents[0].time === "number", '"time" param should be a number')
    });

    it(`list apps`, async function () {

        const apps = await device.appList();

        // List is sorted alphabetically
        const expected = [
            "/Common/app1_t443_vs",
            "/Common/app1_t80_vs",
            "/Common/app2_t443_vs",
            "/Common/app2_t80_vs",
            "/Common/app3_t8443_vs",
            "/Common/app4_t80_vs",
            "/Common/bigiq.benlab.io_t443_vs",
            "/Common/forwarder_net_0.0.0.0",
            "/Common/persistTest_80_vs",
          ]

        assert.deepStrictEqual(apps, expected, 'Should get list of virtual servers / apps');
    });

    it(`get app config by name`, async function () {

        // Verify we can extract an app and it has the expected structure
        await device.apps('/Common/app4_t80_vs')
            .then(app => {
                const appConfig = app![0];
                // Check that we got lines array with expected number of entries
                assert.ok(appConfig.lines.length === 8, 'Should have 8 config lines');
                // Check first line is the virtual server
                assert.ok(appConfig.lines[0].startsWith('ltm virtual /Common/app4_t80_vs'), 'First line should be virtual');
                // Check we have pool config
                assert.ok(appConfig.lines[1].startsWith('ltm pool /Common/app4_pool'), 'Second line should be pool');
                // Check we have node config
                assert.ok(appConfig.lines[2].startsWith('ltm node /Common/api.chucknorris.io'), 'Third line should be node');
                // Check we have iRule
                assert.ok(appConfig.lines[3].startsWith('ltm rule /Common/app4_pool_rule'), 'Fourth line should be rule');
                // Check we have policy
                assert.ok(appConfig.lines[4].startsWith('ltm policy /Common/app4_ltPolicy'), 'Fifth line should be policy');
            })


    });

    it(`conf file explode should/not have these details`, async function () {

        const baseLtmProfiles = device.defaultProfileBase;
        const sysLowProfiles = device.defaultLowProfileBase;

        const configFilesNumber = device.configFiles.length;
        // const xmlStats = device.deviceXmlStats;
        const fileStoreLength = device.fileStore.length;

        assert.ok(!baseLtmProfiles);
        assert.ok(!sysLowProfiles);
        assert.ok(configFilesNumber === 1);
        // assert.ok(Object.keys(xmlStats).length === 0);
        assert.ok(fileStoreLength === 0);

    });


    it(`parse badArchive1.tar.gz -> fail`, async function () {

        const device = new BigipConfig();
        const parsedFileEvents: any[] = [];
        const parsedObjEvents: any[] = [];

        device.on('parseFile', (x: any) => parsedFileEvents.push(x))
        device.on('parseObject', (x: any) => parsedObjEvents.push(x))

        const badArchive = path.join(__dirname, 'artifacts', 'badArchive1.tar.gz')

        // this still doesn't reject as expected
        // this should fail since the archive has ban files...
        await device.loadParseAsync(badArchive)
            .then(async parse => {
                const p = parse;
                const expld = await device.explode();
            })
            .catch(err => {
                console.log(err)
                Promise.reject(err);
            })

        // assert.ok(err)
        // assert.deepStrictEqual(err, 'tmos version CHANGE detected: previous file version was undefined -> this tmos version is 15.1.0.4');

    });
});

