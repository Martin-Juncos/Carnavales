import assert from "node:assert/strict";
import test from "node:test";
import { calcularResultadosV1 } from "../../../src/modules/resultados/resultados.engine.js";
import { calcularResultadosV1 as servicio } from "../../../src/modules/resultados/resultados.js";

function entradas() {
  return {
    comparsas: [{id:"a",categoria:"PRIMERA"},{id:"b",categoria:"PRIMERA"}],
    sujetos: [{id:"sa",comparsaId:"a"},{id:"sb",comparsaId:"b"}],
    rubros: [{id:"r",evaluable:true,sumaAComparsa:true,tipoSujeto:"COMPARSA",tipoRubro:null}],
    puntajes: [{rubroVersionId:"r",sujetoId:"sa",valor:4},{rubroVersionId:"r",sujetoId:"sa",valor:3},
      {rubroVersionId:"r",sujetoId:"sb",valor:5}],
    penalizaciones: [], parametros:{maxCarrosComparsa:2,categoriasGenerales:["PRIMERA"]},
  };
}
test("el servicio conserva el export del motor y la suma artistica sin descarte", () => {
  assert.equal(servicio, calcularResultadosV1);
  assert.deepEqual(calcularResultadosV1(entradas()).resultadosComparsa.map(c => [c.comparsaId,c.puntajeTotal,c.posicion]),
    [["a",7,1],["b",5,2]]);
});
test("el motor es determinista y no modifica las entradas", () => {
  const datos=entradas(), copia=structuredClone(datos);
  const freeze=value => { if(value && typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);} };
  freeze(datos);
  assert.deepEqual(calcularResultadosV1(datos),calcularResultadosV1(datos));
  assert.deepEqual(datos,copia);
});
test("los padres suman hijos e ignoran notas manuales del padre", () => {
  const datos=entradas();datos.rubros[0].padreId="padre";
  datos.rubros.push({id:"padre",evaluable:true,sumaAComparsa:true,tipoSujeto:"COMPARSA"});
  datos.puntajes.push({rubroVersionId:"padre",sujetoId:"sa",valor:5});
  const salida=calcularResultadosV1(datos);
  assert.equal(salida.resultadosRubroSujeto.find(r=>r.rubroVersionId==="padre"&&r.sujetoId==="sa").puntajeArtistico,7);
  assert.equal(salida.resultadosComparsa[0].puntajeTotal,7);
});
test("un empate conserva ambos candidatos sin elegir ganador", () => {
  const datos=entradas();datos.puntajes=[{rubroVersionId:"r",sujetoId:"sa",valor:5},{rubroVersionId:"r",sujetoId:"sb",valor:5}];
  const salida=calcularResultadosV1(datos);
  assert.deepEqual(salida.resultadosComparsa.map(c=>[c.posicion,c.empatado]),[[1,true],[1,true]]);
  assert.deepEqual(salida.empates.find(e=>e.ambito==="COMPARSA").candidatosIds,["a","b"]);
});
test("las penalizaciones no producen totales negativos ni borran puntajes artisticos", () => {
  const datos=entradas();datos.penalizaciones=[{comparsaId:"a",tipo:"RETRASO_INGRESO",puntosDescuento:15}];
  const salida=calcularResultadosV1(datos);
  assert.equal(salida.resultadosComparsa.find(c=>c.comparsaId==="a").puntajeTotal,0);
  assert.equal(salida.resultadosRubroSujeto.find(r=>r.sujetoId==="sa").puntajeArtistico,7);
});
