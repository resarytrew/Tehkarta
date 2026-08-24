import type { CounterAttributes, Telemetry } from '@tehkarta/ports';

export class JsonLineTelemetry implements Telemetry {
  private emit(event:Record<string,unknown>):void {
    process.stdout.write(`${JSON.stringify({kind:'metric',at:new Date().toISOString(),...event})}\n`);
  }
  increment(name:string,value=1,attributes:CounterAttributes={}):void { this.emit({metric:name,type:'counter',value,attributes}); }
  timing(name:string,milliseconds:number,attributes:CounterAttributes={}):void { this.emit({metric:name,type:'timing',milliseconds,attributes}); }
  recordError(error:unknown,attributes:CounterAttributes={}):void { this.emit({metric:'application.error',type:'error',errorType:error instanceof Error?error.name:'UnknownError',attributes}); }
}
