import { a as require_react, o as __toESM, t as require_jsx_runtime } from "../index.js";
//#region app/page.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function Home() {
	(0, import_react.useEffect)(() => {
		window.location.replace(`https://bfc8g4v63.github.io/${window.location.search}${window.location.hash}`);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		style: {
			minHeight: "100vh",
			display: "grid",
			placeItems: "center",
			padding: 24
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
			"正在前往好日子相聚…",
			" ",
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
				href: "https://bfc8g4v63.github.io",
				children: "立即開啟"
			})
		] })
	});
}
//#endregion
export { Home as default };
