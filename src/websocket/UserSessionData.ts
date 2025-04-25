// /* eslint-disable @typescript-eslint/no-explicit-any */
// import * as fs from 'node:fs/promises';

// export class UserSessionData {
//     protected data: { [handlerKey: string]: any } = {};
//     protected _isStateLoaded = false;

//     constructor(protected filePath: string) {}

//     isStateLoaded(): boolean {
//         return this._isStateLoaded;
//     }

//     public getValue<T = any>(key: string): T | undefined {
//         return this.data[key];
//     }

//     public getValueOrThrow<T = any>(key: string): T {
//         const value = this.data[key];
//         if (!value) {
//             throw new Error(`Missing required value for key "${key}".`);
//         }
//         return value;
//     }

//     public setValue(key: string, value: any) {
//         this.data[key] = value;
//     }

//     public removeValue(key: string) {
//         this.data[key] = undefined;
//     }

//     public reset() {
//         this.data = {};
//         this._isStateLoaded = false;
//     }

//     public async saveToFile(): Promise<void> {
//         try {
//             // const dir = path.dirname(filePath);
//             // await fs.mkdir(dir, { recursive: true });
//             await fs.writeFile(this.filePath, JSON.stringify(this.data));
//         } catch (err) {
//             throw new Error(`Failed to save session data: ${err instanceof Error ? err.message : String(err)}`);
//         }
//     }

// }
