// 站內連結與資源的前綴：base='/DailyNews' 時返回 '/DailyNews/'，
// 本地（無 base）時為 '/'，模板中一律寫 `${BASE}issue/...` 這種形式。
const raw = import.meta.env.BASE_URL;
const BASE = raw.endsWith('/') ? raw : `${raw}/`;
export default BASE;
