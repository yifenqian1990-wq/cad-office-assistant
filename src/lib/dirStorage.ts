import { get, set } from 'idb-keyval';

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  await set('cadai_dir_handle', handle);
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return await get('cadai_dir_handle');
}

export async function verifyDirectoryPermission(handle: FileSystemDirectoryHandle, mode: 'read' | 'readwrite' = 'readwrite') {
  if (await (handle as any).queryPermission({ mode }) === 'granted') {
    return true;
  }
  if (await (handle as any).requestPermission({ mode }) === 'granted') {
    return true;
  }
  return false;
}
