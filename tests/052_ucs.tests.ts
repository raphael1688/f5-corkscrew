
'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';

import BigipConfig from '../src/ltm';
import { logOutput } from './explosionOutput';
import { archiveMake } from './archive_generator/archiveBuilder';
import { Explosion } from '../src/models';


let device: BigipConfig;
let log;
let err;
let expld: Explosion;
const parsedFileEvents: any[] = [];
const parsedObjEvents: any[] = [];
let testFile = '';
let outFile = '';


describe('ucs tests', async function () {


    before(async () => {
        testFile = await archiveMake('ucs') as string;
        // testFile = path.join('/home', 'ted', 'temp.ucs');
        const testFileDetails = path.parse(testFile);

        outFile = path.join(testFileDetails.dir, `${testFileDetails.base}.log`)
        console.log('test file: ', __filename);
        console.log('outFile', outFile);
    })

    it(`instantiate -> parse configs, get parseTime, explode`, async function () {

        device = new BigipConfig();
        
        device.on('parseFile', (x: any) => parsedFileEvents.push(x))
        device.on('parseObject', (x: any) => parsedObjEvents.push(x))

        const parseTime = await device.loadParseAsync(testFile);
        expld = await device.explode();

        fs.writeFileSync(`${outFile}.json`, JSON.stringify(expld, undefined, 4));
        const bigLog = logOutput(device.configObject, expld);
        fs.writeFileSync(outFile, bigLog);

        assert.ok(parseTime, 'should be a number');

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
            "/foo.a_1-c/barSpec.b-443_vs",
            "/foo.a_1-c/barSpec.b-80_vs",
            "/foo/app8_80vs",
            "/foo/defaultsUDP_5555/serviceMain",
            "/foo/t1.lab.io_80vs",
            "/foo/wiffle_redirect_vs",
            "/hue-infra/hue-up/hue-up.benlab.io_t443_vs",
            "/hue-infra/hue-up/hue-up.benlab.io_t80_vs",
          ]

        assert.deepStrictEqual(apps, expected, 'Should get list of virtual servers / apps');

    });

    it(`get app config by name`, async function () {

        const app = await device.apps('/Common/app4_t80_vs');
        const appConfig = app![0];

        // Verify structure rather than exact string matching
        assert.ok(appConfig.lines.length === 8, 'Should have 8 config lines');
        assert.ok(appConfig.lines[0].startsWith('ltm virtual /Common/app4_t80_vs'), 'First line should be virtual');
        assert.ok(appConfig.lines[1].startsWith('ltm pool /Common/app4_pool'), 'Second line should be pool');
        assert.ok(appConfig.lines[2].startsWith('ltm node /Common/api.chucknorris.io'), 'Third line should be node');
        assert.ok(appConfig.lines[3].startsWith('ltm rule /Common/app4_pool_rule'), 'Fourth line should be rule');
        assert.ok(appConfig.lines[4].startsWith('ltm policy /Common/app4_ltPolicy'), 'Fifth line should be policy');
    });

    it(`ucs should NOT have default profiles/settings`, async function () {

        const baseLtmProfiles = device.defaultProfileBase;
        const sysLowProfiles = device.defaultLowProfileBase;

        assert.ok(!baseLtmProfiles);
        assert.ok(!sysLowProfiles);
        
    });
});

