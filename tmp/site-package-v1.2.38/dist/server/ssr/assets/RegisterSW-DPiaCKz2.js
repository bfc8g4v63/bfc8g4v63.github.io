import { a as require_react, o as __toESM } from "../index.js";
//#region app/RegisterSW.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function RegisterSW() {
	(0, import_react.useEffect)(() => {
		if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => void 0);
	}, []);
	return null;
}
//#endregion
export { RegisterSW };
