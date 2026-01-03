/* eslint-disable @typescript-eslint/no-unused-vars */

'use strict';

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import BigipConfig from '../src/ltm';
import { parseConfig } from '../src/universalParse';

describe('Universal Parser Tests', function () {

    describe('parseConfig - Basic Parsing', function () {

        it('should parse simple pool', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm pool /Common/web_pool {
    load-balancing-mode round-robin
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
        }
    }
    monitor /Common/http
}`;
            const result = parseConfig(config);
            
            assert.ok(result.ltm, 'Should have ltm key');
            assert.ok(result.ltm.pool, 'Should have ltm.pool');
            assert.ok(result.ltm.pool['/Common/web_pool'], 'Should have pool by name');
            assert.strictEqual(
                result.ltm.pool['/Common/web_pool']['load-balancing-mode'], 
                'round-robin'
            );
        });

        it('should parse virtual server with profiles', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/app_vs {
    destination /Common/10.0.0.100:443
    ip-protocol tcp
    pool /Common/app_pool
    profiles {
        /Common/http { }
        /Common/tcp { }
    }
}`;
            const result = parseConfig(config);
            
            assert.ok(result.ltm.virtual['/Common/app_vs']);
            assert.strictEqual(
                result.ltm.virtual['/Common/app_vs'].destination, 
                '/Common/10.0.0.100:443'
            );
            assert.ok(result.ltm.virtual['/Common/app_vs'].profiles);
        });

        it('should parse multiple partitions', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/common_vs {
    destination /Common/10.0.0.1:80
}
ltm virtual /Tenant1/tenant1_vs {
    destination /Tenant1/10.0.0.2:80
}
ltm virtual /Tenant2/tenant2_vs {
    destination /Tenant2/10.0.0.3:80
}`;
            const result = parseConfig(config);
            
            assert.ok(result.ltm.virtual['/Common/common_vs']);
            assert.ok(result.ltm.virtual['/Tenant1/tenant1_vs']);
            assert.ok(result.ltm.virtual['/Tenant2/tenant2_vs']);
        });
    });

    describe('parseConfig - Edge Cases', function () {

        it('should parse empty object', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm pool /Common/empty_pool { }`;
            const result = parseConfig(config);
            
            assert.ok(result.ltm.pool['/Common/empty_pool']);
        });

        it('should parse pseudo-array (vlans)', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
    vlans { /Common/external /Common/internal }
    vlans-enabled
}`;
            const result = parseConfig(config);
            const vs = result.ltm.virtual['/Common/test_vs'];
            
            assert.ok(Array.isArray(vs.vlans), 'vlans should be an array');
            assert.deepStrictEqual(vs.vlans, ['/Common/external', '/Common/internal']);
        });

        it('should parse multiline description', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    description "This is a
multiline description
with line breaks"
    destination /Common/10.0.0.1:80
}`;
            const result = parseConfig(config);
            const vs = result.ltm.virtual['/Common/test_vs'];
            
            assert.ok(vs.description.includes('\n'), 'Description should contain newlines');
        });

        it('should parse iRule preserving content', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm rule /Common/test_rule {
when HTTP_REQUEST {
    if { [HTTP::uri] starts_with "/api" } {
        pool api_pool
    }
}
}`;
            const result = parseConfig(config);
            
            assert.ok(result.ltm.rule['/Common/test_rule']);
            assert.ok(result.ltm.rule['/Common/test_rule'].includes('HTTP_REQUEST'));
        });

        it('should parse monitor min X of pattern', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm pool /Common/test_pool {
    monitor min 2 of { /Common/http /Common/tcp /Common/icmp }
}`;
            const result = parseConfig(config);
            const pool = result.ltm.pool['/Common/test_pool'];
            
            // The parser returns this as a special format
            assert.ok(pool.monitor || pool['monitor min 2 of']);
        });

        it('should parse nested objects deeply', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm pool /Common/deep_pool {
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
            session monitor-enabled
            state up
        }
        /Common/10.0.1.11:80 {
            address 10.0.1.11
            session user-disabled
        }
    }
}`;
            const result = parseConfig(config);
            const pool = result.ltm.pool['/Common/deep_pool'];
            
            assert.ok(pool.members);
            assert.ok(pool.members['/Common/10.0.1.10:80']);
            assert.strictEqual(pool.members['/Common/10.0.1.10:80'].address, '10.0.1.10');
            assert.strictEqual(pool.members['/Common/10.0.1.10:80'].session, 'monitor-enabled');
        });

        it('should handle escaped brackets in iRules', function () {
            const config = `#TMSH-VERSION: 15.1.0
ltm rule /Common/escape_rule {
when HTTP_REQUEST {
    # Comment with { bracket
    set var "string with \\{ escaped"
    if { 1 } {
        pool test_pool
    }
}
}`;
            const result = parseConfig(config);
            assert.ok(result.ltm.rule['/Common/escape_rule']);
        });
    });

    describe('parseConfig - GTM Objects', function () {

        it('should parse GTM wideip', function () {
            const config = `#TMSH-VERSION: 15.1.0
gtm wideip a /Common/app.example.com {
    pool-lb-mode round-robin
    pools {
        /Common/app_pool {
            order 0
        }
    }
}`;
            const result = parseConfig(config);
            
            assert.ok(result.gtm);
            assert.ok(result.gtm.wideip);
            assert.ok(result.gtm.wideip.a);
            assert.ok(result.gtm.wideip.a['/Common/app.example.com']);
        });

        it('should parse GTM pool', function () {
            const config = `#TMSH-VERSION: 15.1.0
gtm pool a /Common/app_gtm_pool {
    load-balancing-mode round-robin
    members {
        /Common/server1:/Common/vs1 {
            member-order 0
        }
    }
}`;
            const result = parseConfig(config);
            
            assert.ok(result.gtm.pool.a['/Common/app_gtm_pool']);
        });
    });
});

describe('BigipConfig - loadParseString', function () {

    it('should parse config from string', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
    pool /Common/test_pool
}
ltm pool /Common/test_pool {
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
        }
    }
}`;
        const bigip = new BigipConfig();
        const parseTime = await bigip.loadParseString(config);
        
        assert.ok(parseTime > 0, 'Should return parse time');
        assert.ok(bigip.configObject.ltm?.virtual?.['/Common/test_vs']);
        assert.ok(bigip.configObject.ltm?.pool?.['/Common/test_pool']);
    });

    it('should set inputFileType to .conf', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        assert.strictEqual(bigip.inputFileType, '.conf');
    });

    it('should accept custom filename parameter', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config, 'custom-config.conf');
        
        assert.strictEqual(bigip.configFiles[0].fileName, 'custom-config.conf');
    });

    it('should detect TMOS version from config', async function () {
        const config = `#TMSH-VERSION: 16.1.2.1
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        assert.strictEqual(bigip.tmosVersion, '16.1.2.1');
        assert.strictEqual(bigip.stats.sourceTmosVersion, '16.1.2.1');
    });

    it('should populate stats after parsing', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/vs1 {
    destination /Common/10.0.0.1:80
}
ltm virtual /Common/vs2 {
    destination /Common/10.0.0.2:80
}
ltm pool /Common/pool1 {
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
        }
    }
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        assert.ok(bigip.stats.parseTime > 0, 'Should have parse time');
        assert.ok(bigip.stats.objectCount > 0, 'Should have object count');
        assert.ok(bigip.stats.objects, 'Should have objects stats');
    });

    it('should handle config with no virtual servers', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm pool /Common/orphan_pool {
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
        }
    }
}
ltm node /Common/10.0.1.10 {
    address 10.0.1.10
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        assert.ok(bigip.configObject.ltm?.pool?.['/Common/orphan_pool']);
        assert.ok(bigip.configObject.ltm?.node?.['/Common/10.0.1.10']);
        
        const apps = bigip.listApps();
        assert.strictEqual(apps.length, 0);
    });

    it('should store config file content', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        assert.strictEqual(bigip.configFiles.length, 1);
        assert.strictEqual(bigip.configFiles[0].size, config.length);
        assert.ok(bigip.configFiles[0].content.includes('ltm virtual'));
    });

    it('should emit parseFile event', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
}`;
        const bigip = new BigipConfig();
        const events: string[] = [];
        
        bigip.on('parseFile', (fileName: string) => events.push(fileName));
        await bigip.loadParseString(config, 'test-file.conf');
        
        assert.ok(events.includes('test-file.conf'));
    });

    it('should emit parseObject event', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
}`;
        const bigip = new BigipConfig();
        const events: any[] = [];
        
        bigip.on('parseObject', (obj: any) => events.push(obj));
        await bigip.loadParseString(config);
        
        assert.ok(events.length > 0, 'Should emit at least one parseObject event');
        assert.ok(events[0].parsing, 'Event should have parsing property');
        assert.ok(typeof events[0].num === 'number', 'Event should have num property');
    });

    it('should handle complex multi-object config', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/app_vs {
    destination /Common/10.0.0.1:443
    ip-protocol tcp
    pool /Common/app_pool
    profiles {
        /Common/http { }
        /Common/tcp { }
        /Common/clientssl {
            context clientside
        }
    }
    rules {
        /Common/redirect_rule
    }
    persist {
        /Common/cookie {
            default yes
        }
    }
}
ltm pool /Common/app_pool {
    load-balancing-mode least-connections-member
    members {
        /Common/server1:8080 {
            address 192.168.1.10
            session monitor-enabled
        }
        /Common/server2:8080 {
            address 192.168.1.11
            session monitor-enabled
        }
    }
    monitor /Common/http
}
ltm node /Common/server1 {
    address 192.168.1.10
}
ltm node /Common/server2 {
    address 192.168.1.11
}
ltm rule /Common/redirect_rule {
when HTTP_REQUEST {
    if { [HTTP::uri] starts_with "/old" } {
        HTTP::redirect "https://[HTTP::host]/new"
    }
}
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        // Verify all objects parsed
        assert.ok(bigip.configObject.ltm?.virtual?.['/Common/app_vs']);
        assert.ok(bigip.configObject.ltm?.pool?.['/Common/app_pool']);
        assert.ok(bigip.configObject.ltm?.node?.['/Common/server1']);
        assert.ok(bigip.configObject.ltm?.node?.['/Common/server2']);
        assert.ok(bigip.configObject.ltm?.rule?.['/Common/redirect_rule']);
        
        // Verify nested structures
        const vs = bigip.configObject.ltm.virtual['/Common/app_vs'];
        assert.ok(vs.profiles, 'Should have profiles');
        assert.ok(vs.persist, 'Should have persist');
        
        const pool = bigip.configObject.ltm.pool['/Common/app_pool'];
        assert.ok(pool.members, 'Should have members');
        assert.strictEqual(pool['load-balancing-mode'], 'least-connections-member');
    });

    it('should handle Windows line endings (CRLF)', async function () {
        const config = '#TMSH-VERSION: 15.1.0\r\nltm virtual /Common/test_vs {\r\n    destination /Common/10.0.0.1:80\r\n}\r\n';
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        assert.ok(bigip.configObject.ltm?.virtual?.['/Common/test_vs']);
    });

    it('should preserve line property for config reconstruction', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/test_vs {
    destination /Common/10.0.0.1:80
    pool /Common/test_pool
    description "Test virtual server"
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        const vs = bigip.configObject.ltm?.virtual?.['/Common/test_vs'];
        assert.ok(vs.line, 'Should have line property');
        assert.ok(vs.line.includes('destination'), 'Line should contain destination');
    });
});

describe('BigipConfig - listPartitions', function () {

    it('should list partitions from virtuals', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/app1_vs {
    destination /Common/10.0.0.1:80
}
ltm virtual /Tenant1/app2_vs {
    destination /Tenant1/10.0.0.2:80
}
ltm virtual /Tenant2/app3_vs {
    destination /Tenant2/10.0.0.3:80
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        const partitions = bigip.listPartitions();
        
        assert.ok(partitions.includes('Common'));
        assert.ok(partitions.includes('Tenant1'));
        assert.ok(partitions.includes('Tenant2'));
        assert.strictEqual(partitions.length, 3);
    });

    it('should return sorted partitions', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Zebra/app1_vs {
    destination /Zebra/10.0.0.1:80
}
ltm virtual /Alpha/app2_vs {
    destination /Alpha/10.0.0.2:80
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        const partitions = bigip.listPartitions();
        
        assert.deepStrictEqual(partitions, ['Alpha', 'Zebra']);
    });
});

describe('BigipConfig - listApps', function () {

    let bigip: BigipConfig;
    const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/common_app1_vs {
    destination /Common/10.0.0.1:80
}
ltm virtual /Common/common_app2_vs {
    destination /Common/10.0.0.2:80
}
ltm virtual /Tenant1/tenant1_app1_vs {
    destination /Tenant1/10.0.0.3:80
}
ltm virtual /Tenant1/tenant1_app2_vs {
    destination /Tenant1/10.0.0.4:80
}
ltm virtual /Tenant2/tenant2_app1_vs {
    destination /Tenant2/10.0.0.5:80
}`;

    before(async function () {
        bigip = new BigipConfig();
        await bigip.loadParseString(config);
    });

    it('should list all apps', function () {
        const apps = bigip.listApps();
        
        assert.strictEqual(apps.length, 5);
        assert.ok(apps.includes('/Common/common_app1_vs'));
        assert.ok(apps.includes('/Tenant1/tenant1_app1_vs'));
    });

    it('should filter apps by partition', function () {
        const apps = bigip.listApps('Tenant1');
        
        assert.strictEqual(apps.length, 2);
        assert.ok(apps.includes('/Tenant1/tenant1_app1_vs'));
        assert.ok(apps.includes('/Tenant1/tenant1_app2_vs'));
        assert.ok(!apps.includes('/Common/common_app1_vs'));
    });

    it('should return empty array for non-existent partition', function () {
        const apps = bigip.listApps('NonExistent');
        
        assert.strictEqual(apps.length, 0);
    });

    it('should return sorted apps', function () {
        const apps = bigip.listApps('Common');
        
        assert.deepStrictEqual(apps, ['/Common/common_app1_vs', '/Common/common_app2_vs']);
    });
});

describe('BigipConfig - listAppsSummary', function () {

    it('should return app summaries with metadata', async function () {
        const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/app_vs {
    destination /Common/10.0.0.1:443
    pool /Common/app_pool
}`;
        const bigip = new BigipConfig();
        await bigip.loadParseString(config);
        
        const summaries = bigip.listAppsSummary();
        
        assert.strictEqual(summaries.length, 1);
        assert.strictEqual(summaries[0].fullPath, '/Common/app_vs');
        assert.strictEqual(summaries[0].partition, 'Common');
    });
});

describe('BigipConfig - apps() with filters', function () {

    let bigip: BigipConfig;
    const config = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/common_app1_vs {
    destination /Common/10.0.0.1:80
    pool /Common/common_pool1
}
ltm pool /Common/common_pool1 {
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
        }
    }
}
ltm virtual /Tenant1/tenant1_app1_vs {
    destination /Tenant1/10.0.0.2:80
    pool /Tenant1/tenant1_pool1
}
ltm pool /Tenant1/tenant1_pool1 {
    members {
        /Tenant1/10.0.1.20:80 {
            address 10.0.1.20
        }
    }
}
ltm virtual /Tenant2/tenant2_app1_vs {
    destination /Tenant2/10.0.0.3:80
}`;

    before(async function () {
        bigip = new BigipConfig();
        await bigip.loadParseString(config);
    });

    it('should extract all apps when no filter', async function () {
        const apps = await bigip.apps();
        
        assert.strictEqual(apps.length, 3);
    });

    it('should filter by partition', async function () {
        const apps = await bigip.apps({ partition: 'Tenant1' });

        assert.strictEqual(apps.length, 1);
        assert.strictEqual(apps[0].name, 'tenant1_app1_vs');
        assert.strictEqual(apps[0].partition, 'Tenant1');
    });

    it('should filter by multiple partitions', async function () {
        const apps = await bigip.apps({ partitions: ['Common', 'Tenant2'] });

        assert.strictEqual(apps.length, 2);
        const names = apps.map(a => a.name);
        assert.ok(names.includes('common_app1_vs'));
        assert.ok(names.includes('tenant2_app1_vs'));
    });

    it('should filter by specific app names', async function () {
        const apps = await bigip.apps({
            apps: ['/Common/common_app1_vs', '/Tenant2/tenant2_app1_vs']
        });

        assert.strictEqual(apps.length, 2);
        const names = apps.map(a => a.name);
        assert.ok(names.includes('common_app1_vs'));
        assert.ok(names.includes('tenant2_app1_vs'));
        assert.ok(!names.includes('tenant1_app1_vs'));
    });

    it('should handle non-existent app names gracefully', async function () {
        const apps = await bigip.apps({
            apps: ['/Common/common_app1_vs', '/NonExistent/fake_vs']
        });

        assert.strictEqual(apps.length, 1);
        assert.strictEqual(apps[0].name, 'common_app1_vs');
        assert.strictEqual(apps[0].partition, 'Common');
    });

    it('should support legacy single app string argument', async function () {
        const apps = await bigip.apps('/Common/common_app1_vs');

        assert.strictEqual(apps.length, 1);
        assert.strictEqual(apps[0].name, 'common_app1_vs');
        assert.strictEqual(apps[0].partition, 'Common');
    });

    it('should return empty array for non-existent partition', async function () {
        const apps = await bigip.apps({ partition: 'NonExistent' });
        
        assert.strictEqual(apps.length, 0);
    });
});

describe('Integration - MCP Workflow Simulation', function () {

    it('should support complete MCP drift detection workflow', async function () {
        // Simulated TMOS config (as would be fetched via SSH or API)
        const tmosConfig = `#TMSH-VERSION: 15.1.0
ltm virtual /Common/shared_vs {
    destination /Common/10.0.0.1:80
    pool /Common/shared_pool
}
ltm pool /Common/shared_pool {
    members {
        /Common/10.0.1.10:80 {
            address 10.0.1.10
        }
    }
}
ltm virtual /Tenant1/app1_vs {
    destination /Tenant1/192.168.1.1:443
    pool /Tenant1/app1_pool
    profiles {
        /Common/http { }
        /Common/tcp { }
    }
}
ltm pool /Tenant1/app1_pool {
    members {
        /Tenant1/192.168.1.10:8080 {
            address 192.168.1.10
        }
        /Tenant1/192.168.1.11:8080 {
            address 192.168.1.11
        }
    }
    monitor /Common/http
}
ltm virtual /Tenant2/app2_vs {
    destination /Tenant2/192.168.2.1:80
}`;

        // Step 1: Parse config from string (simulating MCP tool receiving config)
        const bigip = new BigipConfig();
        await bigip.loadParseString(tmosConfig);

        // Step 2: Discovery - list partitions (agent can present to user)
        const partitions = bigip.listPartitions();
        assert.deepStrictEqual(partitions, ['Common', 'Tenant1', 'Tenant2']);

        // Step 3: List apps (agent can show available apps)
        const allApps = bigip.listApps();
        assert.strictEqual(allApps.length, 3);

        // Step 4: List apps in specific partition
        const tenant1Apps = bigip.listApps('Tenant1');
        assert.deepStrictEqual(tenant1Apps, ['/Tenant1/app1_vs']);

        // Step 5: Extract specific partition's apps for AS3 conversion
        const tenant1Details = await bigip.apps({ partition: 'Tenant1' });
        assert.strictEqual(tenant1Details.length, 1);
        assert.strictEqual(tenant1Details[0].name, 'app1_vs');
        assert.strictEqual(tenant1Details[0].partition, 'Tenant1');
        
        // Verify we got the associated pool info
        assert.ok(tenant1Details[0].lines.length > 0, 'Should have config lines');

        // Step 6: Extract specific apps by name (user-selected)
        const specificApps = await bigip.apps({ 
            apps: ['/Common/shared_vs', '/Tenant1/app1_vs'] 
        });
        assert.strictEqual(specificApps.length, 2);

        // Step 7: Get app summaries (lightweight for display)
        const summaries = bigip.listAppsSummary('Tenant1');
        assert.strictEqual(summaries.length, 1);
        assert.strictEqual(summaries[0].destination, '/Tenant1/192.168.1.1:443');
        assert.strictEqual(summaries[0].pool, '/Tenant1/app1_pool');
    });
});
