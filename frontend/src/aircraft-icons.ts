// Parametric top-view aircraft silhouettes, ported from the
// "Minimalist plane tracking icons" design doc (Claude design, rev A).
// Each type is one <path> built from real plan proportions, nose to 0°,
// centred on the rotation origin. ViewBox units are metres.

interface EngineCfg {
  t: "nose" | "tprop" | "wing" | "rear";
  prop?: number;
  dia?: number;
  len?: number;
  at?: number | number[];
}

interface TypeCfg {
  k: string;
  name: string;
  i: string;
  c: string;
  L: number;
  S: number;
  fd?: number;
  tt?: number;
  nose?: number;
  wingLE?: number;
  rootC?: number;
  tipC?: number;
  sweep?: number;
  hS?: number;
  hLE?: number;
  hRootC?: number;
  hTipC?: number;
  hSweep?: number;
  eng?: EngineCfg;
  heli?: number;
  rotor?: number;
  blades?: number;
}

const CFG: TypeCfg[] = [
  {k:'C172',name:'Cessna 172S',i:'C172',c:'GA piston',L:8.28,S:11.0,fd:1.2,nose:.18,wingLE:.24,rootC:.165,tipC:.155,sweep:1,hS:3.4,hLE:.82,hRootC:.14,hTipC:.11,hSweep:10,eng:{t:'nose',prop:1.93}},
  {k:'C208',name:'Cessna 208B Caravan',i:'C208',c:'Utility turboprop',L:12.67,S:15.88,fd:1.6,nose:.17,wingLE:.20,rootC:.16,tipC:.12,sweep:2,hS:6.25,hLE:.82,hRootC:.12,hTipC:.08,hSweep:14,eng:{t:'nose',prop:2.69}},
  {k:'PC12',name:'Pilatus PC-12 NGX',i:'PC12',c:'Single turboprop',L:14.4,S:16.28,fd:1.65,nose:.20,wingLE:.28,rootC:.16,tipC:.09,sweep:3,hS:5.2,hLE:.84,hRootC:.11,hTipC:.07,hSweep:14,eng:{t:'nose',prop:2.67}},
  {k:'DH8D',name:'Dash 8 Q400',i:'DH8D',c:'Regional turboprop',L:32.83,S:28.42,fd:2.69,nose:.13,wingLE:.30,rootC:.11,tipC:.055,sweep:4,hS:9.4,hLE:.87,hRootC:.085,hTipC:.05,hSweep:16,eng:{t:'tprop',dia:1.5,len:5.2,at:.30,prop:4.11}},
  {k:'CRJ9',name:'Bombardier CRJ-900',i:'CRJ9',c:'Regional jet',L:36.24,S:24.85,fd:2.69,tt:1,nose:.12,wingLE:.42,rootC:.17,tipC:.05,sweep:27,hS:7.9,hLE:.90,hRootC:.075,hTipC:.035,hSweep:34,eng:{t:'rear',dia:1.75,len:4.3,at:.57}},
  {k:'E75L',name:'Embraer E175',i:'E75L',c:'Regional jet',L:31.68,S:26.0,fd:3.01,nose:.13,wingLE:.40,rootC:.17,tipC:.05,sweep:25,hS:9.0,hLE:.86,hRootC:.09,hTipC:.04,hSweep:30,eng:{t:'wing',dia:1.7,len:3.9,at:[.34]}},
  {k:'E295',name:'Embraer E195-E2',i:'E295',c:'Regional jet',L:41.5,S:35.1,fd:3.01,nose:.12,wingLE:.40,rootC:.16,tipC:.045,sweep:26,hS:11.2,hLE:.86,hRootC:.085,hTipC:.035,hSweep:30,eng:{t:'wing',dia:2.0,len:4.4,at:[.33]}},
  {k:'BCS3',name:'Airbus A220-300',i:'BCS3',c:'Narrowbody',L:38.71,S:35.1,fd:3.7,nose:.13,wingLE:.38,rootC:.16,tipC:.045,sweep:26,hS:11.4,hLE:.87,hRootC:.085,hTipC:.04,hSweep:31,eng:{t:'wing',dia:2.05,len:4.5,at:[.34]}},
  {k:'A20N',name:'Airbus A320neo',i:'A20N',c:'Narrowbody',L:37.57,S:35.8,fd:3.95,nose:.12,wingLE:.37,rootC:.16,tipC:.045,sweep:27,hS:12.45,hLE:.87,hRootC:.09,hTipC:.04,hSweep:31,eng:{t:'wing',dia:2.25,len:4.8,at:[.34]}},
  {k:'B39M',name:'Boeing 737 MAX 8',i:'B38M',c:'Narrowbody',L:39.52,S:35.92,fd:3.76,nose:.12,wingLE:.37,rootC:.16,tipC:.045,sweep:27,hS:14.35,hLE:.87,hRootC:.09,hTipC:.04,hSweep:31,eng:{t:'wing',dia:2.15,len:4.6,at:[.33]}},
  {k:'A333',name:'Airbus A330-300',i:'A333',c:'Widebody',L:63.66,S:60.3,fd:5.64,nose:.11,wingLE:.36,rootC:.18,tipC:.04,sweep:30,hS:19.4,hLE:.87,hRootC:.085,hTipC:.035,hSweep:34,eng:{t:'wing',dia:2.85,len:6.3,at:[.35]}},
  {k:'B789',name:'Boeing 787-9',i:'B789',c:'Widebody',L:62.81,S:60.12,fd:5.77,nose:.11,wingLE:.36,rootC:.18,tipC:.04,sweep:32,hS:21.5,hLE:.87,hRootC:.08,hTipC:.035,hSweep:36,eng:{t:'wing',dia:3.1,len:6.6,at:[.36]}},
  {k:'B77W',name:'Boeing 777-300ER',i:'B77W',c:'Widebody',L:73.86,S:64.8,fd:6.2,nose:.10,wingLE:.35,rootC:.19,tipC:.04,sweep:31,hS:21.5,hLE:.87,hRootC:.085,hTipC:.035,hSweep:35,eng:{t:'wing',dia:3.7,len:7.3,at:[.36]}},
  {k:'GL7T',name:'Global 7500',i:'GL7T',c:'Business jet',L:33.88,S:31.75,fd:2.69,tt:1,nose:.16,wingLE:.45,rootC:.15,tipC:.05,sweep:33,hS:8.5,hLE:.90,hRootC:.07,hTipC:.03,hSweep:32,eng:{t:'rear',dia:1.8,len:4.6,at:.59}},
  {k:'CL35',name:'Challenger 350',i:'CL35',c:'Business jet',L:20.92,S:21.0,fd:2.69,tt:1,nose:.16,wingLE:.44,rootC:.17,tipC:.06,sweep:28,hS:7.6,hLE:.90,hRootC:.09,hTipC:.04,hSweep:26,eng:{t:'rear',dia:1.5,len:3.7,at:.57}},
  {k:'A139',name:'Leonardo AW139',i:'A139',c:'Rotary',L:13.52,S:13.8,heli:1,rotor:13.8,blades:5},
];

const f = (n: number): number => Math.round(n * 10) / 10;

function rr(x0: number, x1: number, y0: number, y1: number, r: number): string {
  if (!r) return `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(x0)} ${f(y1)}Z`;
  return `M${f(x0 + r)} ${f(y0)}L${f(x1 - r)} ${f(y0)}Q${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)}L${f(x1)} ${f(y1 - r)}Q${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)}L${f(x0 + r)} ${f(y1)}Q${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - r)}L${f(x0)} ${f(y0 + r)}Q${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)}Z`;
}

function blade(cx: number, cy: number, r0: number, r1: number, th: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const h = th / 2;
  const p = [
    [r0, -h],
    [r1, -h],
    [r1, h],
    [r0, h],
  ].map((q) => [cx + q[0] * c - q[1] * s, cy + q[0] * s + q[1] * c]);
  return `M${p.map((q) => `${f(q[0])} ${f(q[1])}`).join("L")}Z`;
}

function buildHeli(c: TypeCfg): { d: string; ext: number } {
  const R = c.rotor! / 2;
  const yN = -5.6;
  const yT = 7.1;
  const hub = -1.0;
  const P = [
    [1.5, -3.2],
    [1.6, -0.4],
    [1.1, 1.5],
    [0.45, 2.8],
    [0.45, 5.8],
    [0.9, 6.6],
  ];
  let d = `M0 ${yN}C1.05 ${f(yN + 0.5)} 1.5 ${f(yN + 1.4)} 1.5 -3.2`;
  for (let i = 1; i < P.length; i++) d += `L${f(P[i][0])} ${f(P[i][1])}`;
  d += `L0.28 ${yT}L-0.28 ${yT}`;
  for (let i = P.length - 1; i >= 1; i--) d += `L${f(-P[i][0])} ${f(P[i][1])}`;
  d += `L-1.5 -3.2C-1.5 ${f(yN + 1.4)} -1.05 ${f(yN + 0.5)} 0 ${yN}Z`;
  d += rr(-1.95, 1.95, 5.1, 5.75, 0.32);
  d += rr(0.72, 1.18, 4.5, 7.0, 0.23);
  for (let i = 0; i < c.blades!; i++) d += blade(0, hub, 0.55, R, 0.5, -90 + i * (360 / c.blades!));
  d += rr(-0.9, 0.9, hub - 0.9, hub + 0.9, 0.9);
  return { d, ext: Math.max(c.rotor!, 13.6) };
}

function build(c: TypeCfg): { d: string; ext: number } {
  if (c.heli) return buildHeli(c);
  const D = Math.PI / 180;
  const L = c.L;
  const b = c.S / 2;
  const fw = c.fd! / 2;
  const yN = -L / 2;
  const yT = L / 2;
  const nEnd = yN + c.nose! * L;
  const wLE = yN + c.wingLE! * L;
  const wTE = wLE + c.rootC! * L;
  const tw = Math.tan(c.sweep! * D);
  const tipLE = wLE + (b - fw) * tw;
  const tipTE = tipLE + c.tipC! * L;
  const hb = c.hS! / 2;
  const hLE = yN + c.hLE! * L;
  const hTE = hLE + c.hRootC! * L;
  const hRoot = c.tt ? fw * 0.6 : fw * 0.78;
  const htipLE = hLE + (hb - hRoot) * Math.tan(c.hSweep! * D);
  const htipTE = htipLE + c.hTipC! * L;
  const fwTail = c.tt ? fw * 0.36 : fw * 0.4;
  const tipFlat = fwTail * 0.5;
  const P = [
    [fw, wLE],
    [b, tipLE],
    [b * 0.99, tipTE],
    [fw, wTE],
    [hRoot, hLE],
    [hb, htipLE],
    [hb * 0.94, htipTE],
    [fwTail, hTE],
  ];
  const nc1 = [fw * 0.8, yN + c.nose! * L * 0.06];
  const nc2 = [fw, yN + c.nose! * L * 0.5];
  const tc = [fwTail * 0.92, hTE + (yT - hTE) * 0.5];
  let d = `M0 ${f(yN)}C${f(nc1[0])} ${f(nc1[1])} ${f(nc2[0])} ${f(nc2[1])} ${f(fw)} ${f(nEnd)}`;
  P.forEach((p) => {
    d += `L${f(p[0])} ${f(p[1])}`;
  });
  d += `Q${f(tc[0])} ${f(tc[1])} ${f(tipFlat)} ${f(yT)}L${f(-tipFlat)} ${f(yT)}`;
  d += `Q${f(-tc[0])} ${f(tc[1])} ${f(-fwTail)} ${f(hTE)}`;
  for (let i = P.length - 2; i >= 0; i--) d += `L${f(-P[i][0])} ${f(P[i][1])}`;
  d += `L${f(-fw)} ${f(nEnd)}C${f(-nc2[0])} ${f(nc2[1])} ${f(-nc1[0])} ${f(nc1[1])} 0 ${f(yN)}Z`;

  const e = c.eng;
  if (e && e.t === "wing") {
    (e.at as number[]).forEach((fr) => {
      const x = fr * b;
      const ley = wLE + (x - fw) * tw;
      const hw = e.dia! / 2;
      const y0 = ley - e.len! * 0.72;
      const y1 = ley + e.len! * 0.28;
      d += rr(x - hw, x + hw, y0, y1, hw * 0.6);
      d += rr(-x - hw, -x + hw, y0, y1, hw * 0.6);
    });
  } else if (e && e.t === "rear") {
    const hw = e.dia! / 2;
    const x = fw * 0.88 + hw;
    const y0 = yN + (e.at as number) * L;
    const y1 = y0 + e.len!;
    d += rr(x - hw, x + hw, y0, y1, hw * 0.62);
    d += rr(-x - hw, -x + hw, y0, y1, hw * 0.62);
  } else if (e && e.t === "tprop") {
    const x = (e.at as number) * b;
    const ley = wLE + (x - fw) * tw;
    const hw = e.dia! / 2;
    const pr = e.prop! / 2;
    const y0 = ley - e.len! * 0.55;
    const y1 = ley + e.len! * 0.45;
    [x, -x].forEach((s) => {
      d += rr(s - hw, s + hw, y0, y1, hw * 0.7);
      d += rr(s - pr, s + pr, y0 - 0.7, y0 - 0.1, 0.3);
    });
  } else if (e && e.t === "nose") {
    const pr = e.prop! / 2;
    d += rr(-pr, pr, yN + 0.1, yN + 0.72, 0.3);
  }
  return { d, ext: Math.max(L, c.S) };
}

export interface AircraftShape {
  d: string;
  vb: string;
  ext: number;
  sz: number;
  haloR: number;
  name: string;
}

const FLEET = new Map<string, AircraftShape>();
for (const c of CFG) {
  const r = build(c);
  const h = r.ext * 0.55;
  // Marker size tracks real span, compressed above narrowbody scale so
  // widebodies stay readable without dwarfing everything else.
  const sz = Math.round(
    Math.min(40, Math.max(24, r.ext <= 37.6 ? 26 + (r.ext - 13.8) * 0.504 : 38 + (r.ext - 37.6) * 0.055)),
  );
  FLEET.set(c.k, {
    d: r.d,
    vb: `${f(-h)} ${f(-h)} ${f(2 * h)} ${f(2 * h)}`,
    ext: r.ext,
    sz,
    haloR: f(r.ext * 0.34),
    name: c.name,
  });
}

const CATEGORY_FALLBACK: Record<string, string> = {
  jet: "A20N",
  prop: "DH8D",
  light: "C172",
  heli: "A139",
};

export function aircraftShape(typeCode?: string | null, category?: string | null): AircraftShape {
  const byType = typeCode ? FLEET.get(typeCode.toUpperCase()) : undefined;
  return byType ?? FLEET.get(CATEGORY_FALLBACK[category ?? "jet"] ?? "A20N")!;
}

export function aircraftTypeName(typeCode?: string | null): string | undefined {
  return typeCode ? FLEET.get(typeCode.toUpperCase())?.name : undefined;
}
