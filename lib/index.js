/**
 * dsh-cnc — CNC 转速进给与可加工性检查
 */

export const name = "dsh-cnc";
export const inject = ["tools"];

const NL = String.fromCharCode(10);
const SITE = "https://deepseekbase.com/zh/tools/";
const TEXT_OUTPUT = {
  schema: { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] },
  render: (_args, value) => [{ type: "text", text: (value && value.text) || "" }],
};

const Vc = { aluminum: 300, brass: 200, steel: 120, stainless: 80, titanium: 45, plastic: 400 };
const Fz = { aluminum: 0.08, brass: 0.06, steel: 0.05, stainless: 0.04, titanium: 0.03, plastic: 0.12 };

function n(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function f(x) { return (Math.round(x * 100) / 100).toString(); }

const TOOLS = {
  cnc_speed_feed: {
    description: "CNC 转速与进给：按材料、刀具直径、刃数算主轴转速与进给速度",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        material: { type: "string", enum: ["aluminum", "brass", "steel", "stainless", "titanium", "plastic"], description: "材料" },
        diameter: { type: "number", description: "刀具直径 mm" },
        flutes: { type: "number", description: "刃数，默认 2" },
        vc: { type: "number", description: "自定义线速度 m/min（可选）" },
        fz: { type: "number", description: "自定义每齿进给 mm（可选）" },
      },
      required: ["material", "diameter"],
    },
    run(args) {
      const m = String(args.material || "").toLowerCase();
      const D = n(args.diameter, 0);
      const z = Math.max(1, n(args.flutes, 2));
      if (D <= 0) throw new Error("刀具直径必须大于 0");
      const vc = args.vc != null ? n(args.vc, 0) : (Vc[m] || 120);
      const fz = args.fz != null ? n(args.fz, 0) : (Fz[m] || 0.05);
      const rpm = (vc * 1000) / (Math.PI * D);
      const feed = rpm * z * fz;
      const lines = ["CNC 转速进给", "=".repeat(52), "材料: " + m, "刀具直径: " + f(D) + " mm", "刃数: " + z,
        "线速度 Vc: " + f(vc) + " m/min", "每齿进给 fz: " + f(fz) + " mm", "",
        "主轴转速 S: " + Math.round(rpm) + " rpm", "进给 F: " + Math.round(feed) + " mm/min", "",
        "说明：S = Vc×1000/(πD)，F = S×z×fz；实际需按机床刚性、夹持与冷却调整。", "", "更多工具：" + SITE];
      return lines.join(NL);
    },
  },
  cnc_dfm: {
    description: "CNC 可加工性检查：最小圆角、深孔比、薄壁，给出刀具与工艺风险",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        min_radius: { type: "number", description: "零件最小内圆角 mm" },
        tool_diameter: { type: "number", description: "计划刀具直径 mm" },
        hole_depth: { type: "number", description: "孔深 mm（可选）" },
        hole_diameter: { type: "number", description: "孔径 mm（可选）" },
        wall: { type: "number", description: "最薄壁厚 mm（可选）" },
      },
      required: ["min_radius", "tool_diameter"],
    },
    run(args) {
      const R = n(args.min_radius, 0);
      const D = n(args.tool_diameter, 0);
      if (D <= 0) throw new Error("刀具直径必须大于 0");
      const lines = ["CNC 可加工性检查", "=".repeat(52), "最小内圆角: " + f(R) + " mm", "刀具直径: " + f(D) + " mm", ""];
      let pass = true;
      const rule = (name, ok, detail) => { if (!ok) pass = false; lines.push((ok ? "PASS " : "FAIL ") + name + " — " + detail); };
      rule("内圆角 ≥ 刀具半径", R >= D / 2, "需要 R ≥ " + f(D / 2) + " mm");
      if (args.hole_depth != null && args.hole_diameter != null) {
        const ratio = n(args.hole_depth, 0) / Math.max(0.01, n(args.hole_diameter, 0));
        rule("孔深径比 ≤ 5", ratio <= 5, "当前 " + f(ratio) + "（>5 需深孔钻/枪钻）");
      }
      if (args.wall != null) {
        rule("薄壁 ≥ 0.5 mm", n(args.wall, 0) >= 0.5, "当前 " + f(n(args.wall, 0)) + " mm（易变形）");
      }
      lines.push("");
      lines.push(pass ? "结论：按给定规则可加工" : "结论：存在风险，建议调整");
      lines.push("规则为常见经验值，实际以机床、刀具与装夹为准。");
      lines.push("");
      lines.push("更多工具：" + SITE);
      return lines.join(NL);
    },
  },
};

export function apply(ctx, config) {
  void config;
  for (const name of Object.keys(TOOLS)) {
    const t = TOOLS[name];
    ctx.tools.register({
      name: name,
      description: t.description,
      parameters: t.parameters,
      output: TEXT_OUTPUT,
      async execute(args) { try { return { text: t.run(args || {}) }; } catch (e) { return { text: "处理失败: " + String((e && e.message) || e) }; } },
    });
  }
}
