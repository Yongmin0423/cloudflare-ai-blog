"use client";
import { useSyncExternalStore } from "react";
const CHANGE_EVENT = "blog-studio:local-management";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(CHANGE_EVENT, listener); };
}
const STORAGE_ERROR = "__storage_unavailable__";
export function useLocalDocument<T>(key: string, initial: T, parse: (raw: string) => T) {
  const snapshot = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? "__empty__"; } catch { return STORAGE_ERROR; }
  }, () => null);
  let data = initial;
  let error = "";
  try {
    if (snapshot === STORAGE_ERROR) throw new Error("Storage unavailable");
    if (snapshot && snapshot !== "__empty__") data = parse(snapshot);
  } catch { error = "브라우저 저장소에 접근할 수 없거나 저장본이 손상됐어요. 기존 데이터를 덮어쓰지 않도록 변경을 막았습니다."; }
  function save(value: T) {
    if (error || snapshot === null) throw new Error("저장소를 사용할 수 없어요.");
    const raw = JSON.stringify(value);
    parse(raw);
    localStorage.setItem(key, raw);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return { data, error, ready: snapshot !== null, snapshot, save };
}
