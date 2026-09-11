import {describe,test,expect} from '@jest/globals';
import {assertElectricityNeighbors} from './electricityChronology.js';

const date=new Date('2026-08-15T00:00:00+08:00');
const between=reading=>({date,reading,eventType:'periodEnd',previous:{reading:100},following:{reading:120}});
describe('Electricity physical meter chronology',()=>{
  test.each([100,110,120])('accepts interpolation %s including equal boundaries',reading=>{
    expect(assertElectricityNeighbors(between(reading))).toBe(reading);
  });
  test.each([99,130])('rejects impossible interpolation %s',reading=>{
    expect(()=>assertElectricityNeighbors(between(reading))).toThrow(/between/);
  });
  test('same timestamp requires agreement for a normal meter',()=>{
    expect(assertElectricityNeighbors({...between(110),same:[{reading:110}]})).toBe(110);
    expect(()=>assertElectricityNeighbors({...between(110),same:[{reading:111}]})).toThrow(/timestamp/);
  });
  test.each(['meterReplacement','meterRollover'])('%s compares outgoing final and incoming meter separately',eventType=>{
    const replacement={eventType,reading:0,meterReset:{oldMeterFinalReading:125,evidenceReferences:['work-order']}};
    expect(assertElectricityNeighbors({date,...replacement,previous:{reading:120},following:{reading:5}})).toBe(0);
    expect(()=>assertElectricityNeighbors({date,...replacement,previous:{reading:130}})).toThrow(/between/);
    expect(assertElectricityNeighbors({date,reading:124,previous:{reading:120},following:replacement})).toBe(124);
    expect(()=>assertElectricityNeighbors({date,reading:126,previous:{reading:120},following:replacement})).toThrow(/between/);
    expect(assertElectricityNeighbors({date,reading:125,eventType:'periodEnd',previous:{reading:120},same:[replacement],following:{reading:5}})).toBe(125);
    expect(assertElectricityNeighbors({date,reading:0,eventType:'periodStart',previous:{reading:120},same:[replacement],following:{reading:5}})).toBe(0);
    expect(()=>assertElectricityNeighbors({date,...replacement,meterReset:{oldMeterFinalReading:125}})).toThrow(/evidence/);
  });
});
