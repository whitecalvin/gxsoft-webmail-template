import { adminLicenseFileText } from "./tastemail/admin-management";

/** 파일 선택은 로컬 읽기만 수행한다. 설치는 기존 확인·저장 경로에서 수행한다. */
export async function readAdminLicenseFile(file: Pick<File, "size" | "text">): Promise<string> {
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 8192) throw new Error("Invalid license file");
  return adminLicenseFileText(await file.text());
}
