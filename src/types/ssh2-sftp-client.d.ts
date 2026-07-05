declare module 'ssh2-sftp-client' {
  export default class SftpClient {
    connect(config: Record<string, unknown>): Promise<void>;
    cwd(): Promise<string>;
    exists(path: string): Promise<false | '-' | 'd' | 'l'>;
    list(path: string): Promise<Array<{ type: string; name: string }>>;
    mkdir(path: string, recursive?: boolean): Promise<void>;
    put(input: Buffer | string, remotePath: string): Promise<void>;
    end(): Promise<void>;
  }
}
