'use client';
"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DashboardPage;
var react_1 = require("react");
var card_1 = require("@/components/ui/card");
var button_1 = require("@/components/ui/button");
var badge_1 = require("@/components/ui/badge");
var progress_1 = require("@/components/ui/progress");
var skeleton_1 = require("@/components/ui/skeleton");
// Simple metric card skeleton for dashboard
function MetricCardSkeleton() {
    return (<card_1.Card className="border-border/50 h-full">
      <card_1.CardContent className="p-4">
        <skeleton_1.Skeleton className="h-3 w-16 mb-2"/>
        <skeleton_1.Skeleton className="h-7 w-12 mb-1"/>
        <skeleton_1.Skeleton className="h-2 w-full"/>
      </card_1.CardContent>
    </card_1.Card>);
}
var lucide_react_1 = require("lucide-react");
var utils_1 = require("@/lib/utils");
var link_1 = require("next/link");
function DashboardPage() {
    var _this = this;
    var _a, _b, _c, _d, _e;
    var _f = (0, react_1.useState)(null), vmware = _f[0], setVmware = _f[1];
    var _g = (0, react_1.useState)(true), vmwareLoading = _g[0], setVmwareLoading = _g[1];
    var _h = (0, react_1.useState)(null), firewall = _h[0], setFirewall = _h[1];
    var _j = (0, react_1.useState)(true), firewallLoading = _j[0], setFirewallLoading = _j[1];
    var _k = (0, react_1.useState)([]), sslUsers = _k[0], setSslUsers = _k[1];
    var _l = (0, react_1.useState)(true), sslUsersLoading = _l[0], setSslUsersLoading = _l[1];
    var _m = (0, react_1.useState)([]), nmsDevices = _m[0], setNmsDevices = _m[1];
    var _o = (0, react_1.useState)([]), nmsAlarms = _o[0], setNmsAlarms = _o[1];
    var _p = (0, react_1.useState)(true), nmsLoading = _p[0], setNmsLoading = _p[1];
    var _q = (0, react_1.useState)(null), nmsReachable = _q[0], setNmsReachable = _q[1];
    // Cache helpers for instant display on returning visits
    var CACHE_KEY = 'dashboard_data_cache';
    var CACHE_TTL = 60000; // 60 seconds
    var getCachedData = function () {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw)
                return null;
            var _a = JSON.parse(raw), data = _a.data, ts = _a.ts;
            if (Date.now() - ts > CACHE_TTL) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return data;
        }
        catch (_b) {
            return null;
        }
    };
    var setCachedData = function (data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, ts: Date.now() }));
        }
        catch ( /* quota exceeded, ignore */_a) { /* quota exceeded, ignore */ }
    };
    // Shared abort controller — aborted on unmount to prevent stale fetches
    var abortRef = (0, react_1.useRef)(null);
    // Timeout wrapper: combines component unmount abort + per-request timeout
    var fetchWithTimeout = function (url_1) {
        var args_1 = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args_1[_i - 1] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([url_1], args_1, true), void 0, function (url, ms) {
            var parentSignal, ctrl, timer, onParentAbort, res, e_1;
            var _a;
            if (ms === void 0) { ms = 5000; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        parentSignal = (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.signal;
                        ctrl = new AbortController();
                        timer = setTimeout(function () { return ctrl.abort(); }, ms);
                        onParentAbort = function () { return ctrl.abort(); };
                        parentSignal === null || parentSignal === void 0 ? void 0 : parentSignal.addEventListener('abort', onParentAbort);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, 4, 5]);
                        return [4 /*yield*/, fetch(url, { signal: ctrl.signal })];
                    case 2:
                        res = _b.sent();
                        clearTimeout(timer);
                        return [2 /*return*/, res];
                    case 3:
                        e_1 = _b.sent();
                        clearTimeout(timer);
                        throw e_1;
                    case 4:
                        parentSignal === null || parentSignal === void 0 ? void 0 : parentSignal.removeEventListener('abort', onParentAbort);
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // Phase 1: Load summary instantly (DB-only, ~100-200ms)
    // Phase 2: Load detail data progressively (external APIs)
    (0, react_1.useEffect)(function () {
        abortRef.current = new AbortController();
        var ctrl = abortRef.current;
        // Show cached data instantly if available (returning user)
        var cached = getCachedData();
        if (cached) {
            if (cached.vmware)
                setVmware(cached.vmware);
            if (cached.vmware)
                setVmwareLoading(false);
            if (cached.firewall)
                setFirewall(cached.firewall);
            if (cached.firewall)
                setFirewallLoading(false);
            if (cached.sslUsers)
                setSslUsers(cached.sslUsers);
            if (cached.sslUsers)
                setSslUsersLoading(false);
            if (cached.nmsDevices)
                setNmsDevices(cached.nmsDevices);
            if (cached.nmsAlarms)
                setNmsAlarms(cached.nmsAlarms);
            if (cached.nmsReachable != null)
                setNmsReachable(cached.nmsReachable);
            if (cached.nmsDevices)
                setNmsLoading(false);
        }
        loadSummary();
        loadDetailData();
        return function () { ctrl.abort(); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Save to cache whenever data finishes loading
    (0, react_1.useEffect)(function () {
        if (!vmwareLoading && !firewallLoading && !sslUsersLoading && !nmsLoading) {
            setCachedData({
                vmware: vmware || null,
                firewall: firewall || null,
                sslUsers: sslUsers || [],
                nmsDevices: nmsDevices || [],
                nmsAlarms: nmsAlarms || [],
                nmsReachable: nmsReachable,
            });
        }
    }, [vmware, vmwareLoading, firewall, firewallLoading, sslUsers, sslUsersLoading, nmsDevices, nmsAlarms, nmsLoading, nmsReachable]);
    var isAborted = function (e) { return e instanceof DOMException && e.name === 'AbortError'; };
    var loadSummary = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, json, vm, fg_1, n, err_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/dashboard/summary', { signal: (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.signal })];
                case 1:
                    res = _b.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    json = _b.sent();
                    if (!json)
                        return [2 /*return*/];
                    // Populate VMware from summary
                    if (json.vmware) {
                        vm = json.vmware;
                        setVmware({
                            summary: {
                                clusters: vm.clusters || 0,
                                hosts: vm.hosts || 0,
                                hostsOnline: vm.hostsOnline || 0,
                                hostsOffline: vm.hostsOffline || 0,
                                vms: vm.vms || 0,
                                vmRunning: vm.vmRunning || 0,
                                vmStopped: vm.vmStopped || 0,
                                datastores: vm.datastores || 0,
                                totalStorageTB: vm.totalStorageTB || 0,
                                usedStorageTB: vm.usedStorageTB || 0,
                                totalCpuCores: 0,
                                totalMemoryGB: 0,
                            },
                            hosts: vm.hostsList || [],
                            datastores: vm.topDatastores || [],
                            oldSnapshots: [],
                        });
                        setVmwareLoading(false);
                    }
                    // Populate FortiGate from summary (policy count only, live data comes from Phase 2)
                    if (json.fortigate) {
                        fg_1 = json.fortigate;
                        setFirewall(function (prev) { return prev ? prev : {
                            policies: fg_1.policiesProcessed || 0,
                            addresses: 0,
                            sslVpnSessions: 0,
                            ipsecTunnels: [],
                            quarantineCount: 0,
                        }; });
                        setFirewallLoading(false);
                    }
                    // Populate NMS from summary
                    if (json.nms) {
                        n = json.nms;
                        setNmsReachable(n.pollingActive);
                        setNmsLoading(false);
                    }
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _b.sent();
                    if (!isAborted(err_1))
                        console.warn('[Dashboard] Summary load failed:', err_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var loadDetailData = function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            loadVmwareData();
            loadFirewallData();
            loadSSLUsers();
            loadNmsData();
            return [2 /*return*/];
        });
    }); };
    var loadNmsData = function () { return __awaiter(_this, void 0, void 0, function () {
        var _a, devRes, alarmRes, data, data, err_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 7, 8, 9]);
                    setNmsLoading(true);
                    return [4 /*yield*/, Promise.allSettled([
                            fetchWithTimeout('/api/integrations/nms/network-devices'),
                            fetchWithTimeout('/api/integrations/nms/alarms?status=active'),
                        ])];
                case 1:
                    _a = _b.sent(), devRes = _a[0], alarmRes = _a[1];
                    if (!(devRes.status === 'fulfilled' && devRes.value.ok)) return [3 /*break*/, 3];
                    return [4 /*yield*/, devRes.value.json()];
                case 2:
                    data = _b.sent();
                    setNmsDevices(data.data || []);
                    setNmsReachable(true);
                    return [3 /*break*/, 4];
                case 3:
                    setNmsReachable(false);
                    _b.label = 4;
                case 4:
                    if (!(alarmRes.status === 'fulfilled' && alarmRes.value.ok)) return [3 /*break*/, 6];
                    return [4 /*yield*/, alarmRes.value.json()];
                case 5:
                    data = _b.sent();
                    setNmsAlarms(data.data || []);
                    _b.label = 6;
                case 6: return [3 /*break*/, 9];
                case 7:
                    err_2 = _b.sent();
                    if (!isAborted(err_2))
                        setNmsReachable(false);
                    return [3 /*break*/, 9];
                case 8:
                    setNmsLoading(false);
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    }); };
    var loadVmwareData = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, json, err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, 4, 5]);
                    setVmwareLoading(true);
                    return [4 /*yield*/, fetchWithTimeout('/api/integrations/vmware?type=dashboard')];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    json = _a.sent();
                    if (!json.error)
                        setVmware(json);
                    return [3 /*break*/, 5];
                case 3:
                    err_3 = _a.sent();
                    if (!isAborted(err_3))
                        throw err_3;
                    return [3 /*break*/, 5];
                case 4:
                    setVmwareLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    // Load firewall data incrementally — each API updates state independently
    var loadFirewallData = function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            setFirewallLoading(true);
            // Sync status (~730ms) — updates policies/addresses immediately
            fetchWithTimeout('/api/integrations/fortigate?type=sync-status')
                .then(function (r) { return r.json(); })
                .then(function (j) {
                var d = j === null || j === void 0 ? void 0 : j.data;
                setFirewall(function (prev) { return ({
                    policies: (d === null || d === void 0 ? void 0 : d.policiesProcessed) || 0,
                    addresses: (d === null || d === void 0 ? void 0 : d.addressesProcessed) || 0,
                    sslVpnSessions: (prev === null || prev === void 0 ? void 0 : prev.sslVpnSessions) || 0,
                    ipsecTunnels: (prev === null || prev === void 0 ? void 0 : prev.ipsecTunnels) || [],
                    quarantineCount: (prev === null || prev === void 0 ? void 0 : prev.quarantineCount) || 0,
                }); });
            })
                .catch(function () { });
            // SSL summary (~770ms) — updates sessions count
            fetchWithTimeout('/api/integrations/fortigate?vpn=ssl-summary')
                .then(function (r) { return r.json(); })
                .then(function (j) {
                var d = j === null || j === void 0 ? void 0 : j.data;
                setFirewall(function (prev) { return prev ? __assign(__assign({}, prev), { sslVpnSessions: (d === null || d === void 0 ? void 0 : d.active_sessions) || 0 }) : prev; });
            })
                .catch(function () { });
            // IPSec tunnels (~785ms) — updates tunnel list
            fetchWithTimeout('/api/integrations/fortigate?vpn=ipsec')
                .then(function (r) { return r.json(); })
                .then(function (j) {
                var d = j === null || j === void 0 ? void 0 : j.data;
                setFirewall(function (prev) { return prev ? __assign(__assign({}, prev), { ipsecTunnels: Array.isArray(d) ? d : [] }) : prev; });
            })
                .catch(function () { });
            // Quarantine (~1.5s, slowest) — updates quarantine count last
            fetchWithTimeout('/api/security/quarantine')
                .then(function (r) { return r.json(); })
                .then(function (d) {
                setFirewall(function (prev) { return prev ? __assign(__assign({}, prev), { quarantineCount: (d === null || d === void 0 ? void 0 : d.count) || 0 }) : prev; });
            })
                .catch(function () { })
                .finally(function () { return setFirewallLoading(false); });
            return [2 /*return*/];
        });
    }); };
    var loadSSLUsers = function () { return __awaiter(_this, void 0, void 0, function () {
        var res, json, err_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, 4, 5]);
                    setSslUsersLoading(true);
                    return [4 /*yield*/, fetchWithTimeout('/api/integrations/fortigate?vpn=ssl')];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    json = _a.sent();
                    setSslUsers(json.data || []);
                    return [3 /*break*/, 5];
                case 3:
                    err_4 = _a.sent();
                    if (!isAborted(err_4))
                        setSslUsers([]);
                    return [3 /*break*/, 5];
                case 4:
                    setSslUsersLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    // Calculations
    var summary = vmware === null || vmware === void 0 ? void 0 : vmware.summary;
    var storageUsedPct = (summary === null || summary === void 0 ? void 0 : summary.totalStorageTB) ? Math.round((summary.usedStorageTB / summary.totalStorageTB) * 100) : 0;
    var vmRunPct = (summary === null || summary === void 0 ? void 0 : summary.vms) ? Math.round(((summary.vmRunning || 0) / summary.vms) * 100) : 0;
    var criticalDatastores = (vmware === null || vmware === void 0 ? void 0 : vmware.datastores.filter(function (d) { return d.usedPercent >= 85; })) || [];
    var oldSnapshots = (vmware === null || vmware === void 0 ? void 0 : vmware.oldSnapshots) || [];
    var ipsecUp = (firewall === null || firewall === void 0 ? void 0 : firewall.ipsecTunnels.filter(function (t) { return t.status === 'up'; }).length) || 0;
    var ipsecDown = (firewall === null || firewall === void 0 ? void 0 : firewall.ipsecTunnels.filter(function (t) { return t.status !== 'up'; })) || [];
    var ipsecTotal = (firewall === null || firewall === void 0 ? void 0 : firewall.ipsecTunnels.length) || 0;
    var loading = vmwareLoading || firewallLoading || nmsLoading;
    var nmsOnline = nmsDevices.filter(function (d) { return d.connection_status === 'online'; }).length;
    var nmsOffline = nmsDevices.filter(function (d) { return d.connection_status === 'offline' || d.connection_status === 'unreachable'; }).length;
    var nmsCritical = nmsAlarms.filter(function (a) { return a.severity === 'critical'; }).length;
    // Format duration from seconds to readable
    var formatDuration = function (seconds) {
        if (!seconds)
            return '—';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        if (h > 0)
            return "".concat(h, "s ").concat(m, "d");
        return "".concat(m, "d");
    };
    // Format bytes to MB/GB
    var formatBytes = function (bytes) {
        if (!bytes)
            return '0 B';
        if (bytes >= 1073741824)
            return "".concat((bytes / 1073741824).toFixed(1), " GB");
        return "".concat((bytes / 1048576).toFixed(1), " MB");
    };
    return (<main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Kontrol Paneli</h1>
          <p className="text-xs text-muted-foreground">VMware ve Güvenlik Duvarı kritik metrikleri</p>
        </div>
        <button_1.Button variant="outline" size="sm" onClick={function () { loadSummary(); loadDetailData(); }} disabled={loading}>
          <lucide_react_1.RefreshCcw className={(0, utils_1.cn)('mr-2 h-4 w-4', loading && 'animate-spin')}/>
          Yenile
        </button_1.Button>
      </div>

      {/* VMware & Firewall Stats Row */}
      <react_1.Suspense fallback={<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map(function (_, i) { return <MetricCardSkeleton key={i}/>; })}
        </div>}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <link_1.default href="/virtualization/vms">
          <card_1.Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <card_1.CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Monitor className="h-4 w-4 text-blue-500"/>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">VM</span>
              </div>
              <div className="text-2xl font-black">{(_a = summary === null || summary === void 0 ? void 0 : summary.vms) !== null && _a !== void 0 ? _a : '—'}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-emerald-500 font-medium">{(_b = summary === null || summary === void 0 ? void 0 : summary.vmRunning) !== null && _b !== void 0 ? _b : 0} aktif</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-rose-500 font-medium">{(_c = summary === null || summary === void 0 ? void 0 : summary.vmStopped) !== null && _c !== void 0 ? _c : 0} kapalı</span>
              </div>
            </card_1.CardContent>
          </card_1.Card>
        </link_1.default>

        <link_1.default href="/virtualization/hosts">
          <card_1.Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <card_1.CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Server className="h-4 w-4 text-violet-500"/>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Host</span>
              </div>
              <div className="text-2xl font-black">{vmwareLoading ? '...' : (summary === null || summary === void 0 ? void 0 : summary.hosts) || 0}</div>
              <div className="flex items-center gap-1 mt-1">
                <lucide_react_1.CheckCircle2 className="h-3 w-3 text-emerald-500"/>
                <span className="text-[10px] text-muted-foreground">{(summary === null || summary === void 0 ? void 0 : summary.hostsOnline) || 0} online</span>
              </div>
            </card_1.CardContent>
          </card_1.Card>
        </link_1.default>

        <link_1.default href="/virtualization/datastores">
          <card_1.Card className={(0, utils_1.cn)('hover:shadow-md transition-shadow cursor-pointer h-full', criticalDatastores.length > 0 ? 'border-amber-500/50' : 'border-border/50')}>
            <card_1.CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Database className={(0, utils_1.cn)('h-4 w-4', criticalDatastores.length > 0 ? 'text-amber-500' : 'text-teal-500')}/>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Storage</span>
              </div>
              <div className="text-2xl font-black">{vmwareLoading ? '...' : "".concat(storageUsedPct, "%")}</div>
              <progress_1.Progress value={storageUsedPct} className="h-1.5 mt-2"/>
            </card_1.CardContent>
          </card_1.Card>
        </link_1.default>

        <link_1.default href="/security/policies">
          <card_1.Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <card_1.CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Shield className="h-4 w-4 text-blue-500"/>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Policy</span>
              </div>
              <div className="text-2xl font-black">{firewallLoading ? '...' : (firewall === null || firewall === void 0 ? void 0 : firewall.policies) || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{(firewall === null || firewall === void 0 ? void 0 : firewall.addresses) || 0} adres nesnesi</div>
            </card_1.CardContent>
          </card_1.Card>
        </link_1.default>

        <link_1.default href="/network/ipsec">
          <card_1.Card className={(0, utils_1.cn)('hover:shadow-md transition-shadow cursor-pointer h-full', ipsecDown.length > 0 ? 'border-rose-500/50' : 'border-border/50')}>
            <card_1.CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Globe className={(0, utils_1.cn)('h-4 w-4', ipsecDown.length > 0 ? 'text-rose-500' : 'text-emerald-500')}/>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">IPSec</span>
              </div>
              <div className="text-2xl font-black">
                <span className="text-emerald-500">{ipsecUp}</span>
                <span className="text-muted-foreground text-base">/{ipsecTotal}</span>
              </div>
              <div className="text-[10px] mt-1">
                {ipsecDown.length > 0 ? <span className="text-rose-500 font-medium">{ipsecDown.length} kapalı</span> : <span className="text-emerald-500">Tümü aktif</span>}
              </div>
            </card_1.CardContent>
          </card_1.Card>
        </link_1.default>

        <link_1.default href="/network/ssl-vpn">
          <card_1.Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
            <card_1.CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <lucide_react_1.Wifi className="h-4 w-4 text-cyan-500"/>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">SSL-VPN</span>
              </div>
              <div className={(0, utils_1.cn)('text-2xl font-black', ((firewall === null || firewall === void 0 ? void 0 : firewall.sslVpnSessions) || 0) > 0 && 'text-emerald-500')}>{firewallLoading ? '...' : (firewall === null || firewall === void 0 ? void 0 : firewall.sslVpnSessions) || 0}</div>
              <div className="text-[10px] text-muted-foreground mt-1">aktif oturum</div>
            </card_1.CardContent>
          </card_1.Card>
        </link_1.default>
      </div>
      </react_1.Suspense>

      {/* Main Grid: 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* ESXi Hosts */}
        <card_1.Card className="border-border/50 lg:col-span-2">
          <card_1.CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <lucide_react_1.Server className="h-4 w-4 text-violet-500"/>
                <card_1.CardTitle className="text-sm font-bold">ESXi Hostlar</card_1.CardTitle>
              </div>
              <link_1.default href="/virtualization/hosts">
                <button_1.Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  Tümü <lucide_react_1.ArrowUpRight className="h-3 w-3 ml-1"/>
                </button_1.Button>
              </link_1.default>
            </div>
          </card_1.CardHeader>
          <card_1.CardContent>
            <react_1.Suspense fallback={<div className="space-y-2">{Array.from({ length: 6 }).map(function (_, i) { return <skeleton_1.Skeleton key={i} className="h-6 w-full"/>; })}</div>}>
            {vmware === null || vmware === void 0 ? void 0 : vmware.hosts.slice(0, 6).map(function (host) { return (<div key={host.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={(0, utils_1.cn)('w-2 h-2 rounded-full shrink-0', host.status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500')}/>
                      <span className="text-xs font-medium truncate">{host.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground shrink-0">
                      <span>{host.cpuCores || '—'} CPU</span>
                      <span>{host.memoryGB ? "".concat(host.memoryGB, " GB") : '—'}</span>
                      <badge_1.Badge variant={host.status === 'connected' ? 'success' : 'destructive'} className="text-[9px]">
                        {host.status === 'connected' ? 'Bağlı' : 'Kesik'}
                      </badge_1.Badge>
                    </div>
                  </div>); })}
                {(!(vmware === null || vmware === void 0 ? void 0 : vmware.hosts) || vmware.hosts.length === 0) && <div className="text-xs text-muted-foreground text-center py-4">Host bulunamadı</div>}
            </react_1.Suspense>
          </card_1.CardContent>
        </card_1.Card>

        {/* Snapshots + Quarantine */}
        <div className="space-y-6">
          {/* Old Snapshots */}
          <card_1.Card className={(0, utils_1.cn)('border-border/50', oldSnapshots.length > 0 && 'border-orange-500/50')}>
            <card_1.CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <lucide_react_1.HardDrive className={(0, utils_1.cn)('h-4 w-4', oldSnapshots.length > 0 ? 'text-orange-500' : 'text-muted-foreground')}/>
                  <card_1.CardTitle className="text-sm font-bold">Eski Snapshotlar</card_1.CardTitle>
                </div>
                <badge_1.Badge variant="secondary" className="text-[10px]">{oldSnapshots.length}</badge_1.Badge>
              </div>
              <card_1.CardDescription className="text-[10px]">&gt;7 günlük snapshotlar</card_1.CardDescription>
            </card_1.CardHeader>
            <card_1.CardContent>
              {vmwareLoading ? (<div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>) : oldSnapshots.length === 0 ? (<div className="flex items-center gap-2 text-xs text-emerald-600 py-2">
                  <lucide_react_1.CheckCircle2 className="h-4 w-4"/>
                  <span>Eski snapshot yok</span>
                </div>) : (<div className="space-y-2">
                  {oldSnapshots.slice(0, 4).map(function (snap, idx) { return (<div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <lucide_react_1.AlertTriangle className={(0, utils_1.cn)('h-3 w-3 shrink-0', snap.ageInDays > 30 ? 'text-rose-500' : 'text-orange-500')}/>
                        <span className="truncate font-medium">{snap.vmName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{snap.sizeGB.toFixed(1)} GB</span>
                        <badge_1.Badge variant="secondary" className="text-[9px]">{snap.ageInDays}g</badge_1.Badge>
                      </div>
                    </div>); })}
                  {oldSnapshots.length > 4 && (<link_1.default href="/virtualization/snapshots" className="text-[10px] text-primary hover:underline block text-center pt-1">
                      +{oldSnapshots.length - 4} daha
                    </link_1.default>)}
                </div>)}
            </card_1.CardContent>
          </card_1.Card>

          {/* Quarantine */}
          <card_1.Card className={(0, utils_1.cn)('border-border/50', ((firewall === null || firewall === void 0 ? void 0 : firewall.quarantineCount) || 0) > 0 && 'border-rose-500/50')}>
            <card_1.CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <lucide_react_1.Lock className={(0, utils_1.cn)('h-4 w-4', ((firewall === null || firewall === void 0 ? void 0 : firewall.quarantineCount) || 0) > 0 ? 'text-rose-500' : 'text-muted-foreground')}/>
                  <card_1.CardTitle className="text-sm font-bold">Karantina</card_1.CardTitle>
                </div>
                <link_1.default href="/security/quarantine">
                  <button_1.Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                    Detay <lucide_react_1.ArrowUpRight className="h-3 w-3 ml-1"/>
                  </button_1.Button>
                </link_1.default>
              </div>
            </card_1.CardHeader>
            <card_1.CardContent>
              <div className={(0, utils_1.cn)('text-3xl font-black', ((firewall === null || firewall === void 0 ? void 0 : firewall.quarantineCount) || 0) > 0 ? 'text-rose-500' : 'text-muted-foreground')}>
                {firewallLoading ? '...' : (firewall === null || firewall === void 0 ? void 0 : firewall.quarantineCount) || 0}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">engellenen IP adresi</p>
            </card_1.CardContent>
          </card_1.Card>
        </div>
      </div>

      {/* NMS Stats + Alarms Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* NMS Stats: 2x2 */}
        <div className="grid grid-cols-2 gap-4 content-start">
          <link_1.default href="/integrations/nms">
            <card_1.Card className="border-border/50 hover:shadow-md transition-shadow cursor-pointer h-full">
              <card_1.CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <lucide_react_1.Server className="h-4 w-4 text-blue-500"/>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">SNMP Cihaz</span>
                </div>
                <div className="text-2xl font-black">{nmsLoading ? '...' : nmsDevices.length}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] text-emerald-500 font-medium">{nmsOnline} online</span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-rose-500 font-medium">{nmsOffline} offline</span>
                </div>
              </card_1.CardContent>
            </card_1.Card>
          </link_1.default>
          <link_1.default href="/integrations/nms">
            <card_1.Card className={(0, utils_1.cn)('hover:shadow-md transition-shadow cursor-pointer h-full', nmsOffline > 0 ? 'border-rose-500/50' : 'border-border/50')}>
              <card_1.CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {nmsOffline > 0 ? <lucide_react_1.XCircle className="h-4 w-4 text-rose-500"/> : <lucide_react_1.CheckCircle className="h-4 w-4 text-emerald-500"/>}
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Offline</span>
                </div>
                <div className={(0, utils_1.cn)('text-2xl font-black', nmsOffline > 0 ? 'text-rose-500' : 'text-emerald-500')}>{nmsLoading ? '...' : nmsOffline}</div>
                <div className="text-[10px] text-muted-foreground mt-1">erişilemeyen cihaz</div>
              </card_1.CardContent>
            </card_1.Card>
          </link_1.default>
          <link_1.default href="/integrations/nms">
            <card_1.Card className={(0, utils_1.cn)('hover:shadow-md transition-shadow cursor-pointer h-full', nmsCritical > 0 ? 'border-rose-500/50' : 'border-border/50')}>
              <card_1.CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <lucide_react_1.AlertTriangle className={(0, utils_1.cn)('h-4 w-4', nmsCritical > 0 ? 'text-rose-500' : 'text-muted-foreground')}/>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Kritik Alarm</span>
                </div>
                <div className={(0, utils_1.cn)('text-2xl font-black', nmsCritical > 0 ? 'text-rose-500' : 'text-muted-foreground')}>{nmsLoading ? '...' : nmsCritical}</div>
                <div className="text-[10px] text-muted-foreground mt-1">aktif alarm</div>
              </card_1.CardContent>
            </card_1.Card>
          </link_1.default>
          <link_1.default href="/integrations/nms">
            <card_1.Card className={(0, utils_1.cn)('hover:shadow-md transition-shadow cursor-pointer h-full', nmsReachable === false ? 'border-rose-500/50' : 'border-border/50')}>
              <card_1.CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {nmsReachable ? <lucide_react_1.Wifi className="h-4 w-4 text-emerald-500"/> : <lucide_react_1.WifiOff className="h-4 w-4 text-rose-500"/>}
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">NMS Servis</span>
                </div>
                <div className={(0, utils_1.cn)('text-lg font-black', nmsReachable ? 'text-emerald-500' : nmsReachable === false ? 'text-rose-500' : 'text-muted-foreground')}>
                  {nmsLoading ? '...' : nmsReachable ? 'Bağlı' : 'Bağlı Değil'}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">SNMP servisi</div>
              </card_1.CardContent>
            </card_1.Card>
          </link_1.default>
        </div>

        {/* NMS Alarms */}
        <card_1.Card className={(0, utils_1.cn)('lg:col-span-2 border-border/50', nmsCritical > 0 && 'border-rose-500/50')}>
          <card_1.CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <lucide_react_1.AlertTriangle className={(0, utils_1.cn)('h-4 w-4', nmsCritical > 0 ? 'text-rose-500' : 'text-muted-foreground')}/>
                <card_1.CardTitle className="text-sm font-bold">SNMP Aktif Alarmlar</card_1.CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <badge_1.Badge variant="secondary" className="text-[10px]">{nmsAlarms.length}</badge_1.Badge>
                <link_1.default href="/integrations/nms">
                  <button_1.Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                    Tümü <lucide_react_1.ArrowUpRight className="h-3 w-3 ml-1"/>
                  </button_1.Button>
                </link_1.default>
              </div>
            </div>
          </card_1.CardHeader>
          <card_1.CardContent>
            {nmsLoading ? (<div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>) : nmsAlarms.length === 0 ? (<div className="flex items-center gap-2 text-xs text-emerald-600 py-2">
                <lucide_react_1.CheckCircle2 className="h-4 w-4"/>
                <span>Aktif SNMP alarmı yok</span>
              </div>) : (<div className="space-y-2">
                {nmsAlarms.slice(0, 8).map(function (alarm) { return (<div key={alarm.id} className="flex items-start justify-between gap-2 p-2 rounded-lg border border-border bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{alarm.device_name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{alarm.message}</p>
                    </div>
                    <badge_1.Badge variant={alarm.severity === 'critical' ? 'destructive' : 'secondary'} className="text-[9px] shrink-0">
                      {alarm.severity}
                    </badge_1.Badge>
                  </div>); })}
              </div>)}
          </card_1.CardContent>
        </card_1.Card>
      </div>

      {/* Bottom Row: Datastores + IPSec + Recent Alarms */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datastore Usage */}
        <card_1.Card className="border-border/50">
          <card_1.CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <lucide_react_1.Database className="h-4 w-4 text-teal-500"/>
                <card_1.CardTitle className="text-sm font-bold">Depolama Kullanımı</card_1.CardTitle>
              </div>
              <link_1.default href="/virtualization/datastores">
                <button_1.Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  Tümü <lucide_react_1.ArrowUpRight className="h-3 w-3 ml-1"/>
                </button_1.Button>
              </link_1.default>
            </div>
            <card_1.CardDescription className="text-[10px]">
              {((_d = summary === null || summary === void 0 ? void 0 : summary.usedStorageTB) === null || _d === void 0 ? void 0 : _d.toFixed(1)) || 0} / {((_e = summary === null || summary === void 0 ? void 0 : summary.totalStorageTB) === null || _e === void 0 ? void 0 : _e.toFixed(1)) || 0} TB kullanılıyor
            </card_1.CardDescription>
          </card_1.CardHeader>
          <card_1.CardContent>
            {vmwareLoading ? (<div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>) : (<div className="space-y-3">
                {vmware === null || vmware === void 0 ? void 0 : vmware.datastores.slice().sort(function (a, b) { return b.usedPercent - a.usedPercent; }).slice(0, 5).map(function (ds) { return (<div key={ds.id}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="truncate font-medium">{ds.name}</span>
                        <span className={(0, utils_1.cn)('font-bold', ds.usedPercent >= 90 ? 'text-rose-500' : ds.usedPercent >= 80 ? 'text-amber-500' : 'text-muted-foreground')}>%{ds.usedPercent}</span>
                      </div>
                      <progress_1.Progress value={ds.usedPercent} className="h-1.5"/>
                    </div>); })}
              </div>)}
          </card_1.CardContent>
        </card_1.Card>

        {/* IPSec Tunnels */}
        <card_1.Card className="border-border/50">
          <card_1.CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <lucide_react_1.Globe className="h-4 w-4 text-emerald-500"/>
                <card_1.CardTitle className="text-sm font-bold">IPSec Tünelleri</card_1.CardTitle>
              </div>
              <link_1.default href="/network/ipsec">
                <button_1.Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                  Tümü <lucide_react_1.ArrowUpRight className="h-3 w-3 ml-1"/>
                </button_1.Button>
              </link_1.default>
            </div>
          </card_1.CardHeader>
          <card_1.CardContent>
            {firewallLoading ? (<div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>) : !(firewall === null || firewall === void 0 ? void 0 : firewall.ipsecTunnels.length) ? (<div className="text-xs text-muted-foreground text-center py-4">Tünel bulunamadı</div>) : (<div className="space-y-2">
                {firewall === null || firewall === void 0 ? void 0 : firewall.ipsecTunnels.slice(0, 5).map(function (t, idx) { return (<div key={idx} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={(0, utils_1.cn)('w-2 h-2 rounded-full shrink-0', t.status === 'up' ? 'bg-emerald-500' : 'bg-rose-500')}/>
                      <span className="text-xs font-medium truncate">{t.name}</span>
                    </div>
                    <badge_1.Badge variant={t.status === 'up' ? 'success' : 'destructive'} className="text-[9px] shrink-0">
                      {t.status === 'up' ? 'Aktif' : 'Kapalı'}
                    </badge_1.Badge>
                  </div>); })}
              </div>)}
          </card_1.CardContent>
        </card_1.Card>

        {/* SSL-VPN Connected Users */}
        <card_1.Card className="border-border/50">
          <card_1.CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <lucide_react_1.Wifi className="h-4 w-4 text-cyan-500"/>
                <card_1.CardTitle className="text-sm font-bold">SSL-VPN Bağlı Kullanıcılar</card_1.CardTitle>
              </div>
              <badge_1.Badge variant="secondary" className="text-[10px]">{sslUsers.length}</badge_1.Badge>
            </div>
          </card_1.CardHeader>
          <card_1.CardContent>
            {sslUsersLoading ? (<div className="text-xs text-muted-foreground text-center py-4">Yükleniyor...</div>) : sslUsers.length === 0 ? (<div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <lucide_react_1.Wifi className="h-4 w-4"/>
                <span>Aktif VPN bağlantısı yok</span>
              </div>) : (<div className="space-y-2">
                {sslUsers.slice(0, 6).map(function (user, idx) { return (<div key={idx} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"/>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{user.user_name || '—'}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.remote_host || '—'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[10px] text-muted-foreground">{formatDuration(user.duration)}</span>
                      <span className="text-[9px] text-muted-foreground">↓{formatBytes(user.in_bytes)} ↑{formatBytes(user.out_bytes)}</span>
                    </div>
                  </div>); })}
                {sslUsers.length > 6 && (<link_1.default href="/network/ssl-vpn" className="text-[10px] text-primary hover:underline block text-center pt-1">
                    +{sslUsers.length - 6} daha
                  </link_1.default>)}
              </div>)}
          </card_1.CardContent>
        </card_1.Card>
      </div>

      {/* Cluster Overview (compact) */}
      <div className="mt-6">
        <card_1.Card className="border-border/50">
          <card_1.CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <lucide_react_1.Layers className="h-4 w-4 text-indigo-500"/>
              <card_1.CardTitle className="text-sm font-bold">Kaynak Özeti</card_1.CardTitle>
            </div>
          </card_1.CardHeader>
          <card_1.CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-blue-500">{vmwareLoading ? '...' : (summary === null || summary === void 0 ? void 0 : summary.clusters) || 0}</div>
                <div className="text-[10px] text-muted-foreground font-medium">Cluster</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-violet-500">{vmwareLoading ? '...' : (summary === null || summary === void 0 ? void 0 : summary.totalCpuCores) || 0}</div>
                <div className="text-[10px] text-muted-foreground font-medium">CPU Çekirdeği</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-teal-500">{vmwareLoading ? '...' : "".concat(((summary === null || summary === void 0 ? void 0 : summary.totalMemoryGB) || 0) / 1024 > 1 ? (((summary === null || summary === void 0 ? void 0 : summary.totalMemoryGB) || 0) / 1024).toFixed(1) : (summary === null || summary === void 0 ? void 0 : summary.totalMemoryGB) || 0)}</div>
                <div className="text-[10px] text-muted-foreground font-medium">{((summary === null || summary === void 0 ? void 0 : summary.totalMemoryGB) || 0) / 1024 > 1 ? 'TB RAM' : 'GB RAM'}</div>
              </div>
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="text-2xl font-black text-emerald-500">{vmwareLoading ? '...' : "".concat(vmRunPct, "%")}</div>
                <div className="text-[10px] text-muted-foreground font-medium">VM Aktiflik</div>
              </div>
            </div>
          </card_1.CardContent>
        </card_1.Card>
      </div>
    </main>);
}
