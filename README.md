# feriados-producer

Servicio responsable de obtener, normalizar, auditar y publicar snapshots de feriados nacionales del Peru a partir de `https://www.gob.pe/feriados`.

## Que hace

- ejecuta scraping cada 12 horas en `America/Lima`
- usa `fetch` con retries, timeout y headers realistas
- detecta respuestas bloqueadas por WAF
- usa Playwright como fallback cuando el fetch normal no basta
- parsea y normaliza el HTML a un payload canonico
- detecta cambios por `normalized_hash`
- guarda auditoria de corridas, snapshots historicos y tabla actual en PostgreSQL
- reconstruye Redis despues de una actualizacion valida
- limpia corridas y snapshots antiguos segun la politica de retencion

## Flujo operativo

1. descarga `gob.pe/feriados`
2. valida si hubo bloqueo o HTML inconsistente
3. cae a navegador si hace falta
4. parsea y normaliza feriados
5. calcula hashes del HTML y del payload
6. compara contra el snapshot actual
7. si hubo cambios, escribe PostgreSQL y luego refresca Redis
8. registra la corrida en `scrape_runs`
9. ejecuta cleanup de retencion

## Fuente de verdad y cache

- PostgreSQL es la fuente de verdad
- Redis es cache reconstruible
- el productor escribe PG primero y Redis despues
- si Redis falla, la corrida queda registrada igual y el API puede seguir leyendo desde PG

## Tablas que mantiene

- `scrape_runs`: auditoria de cada ejecucion
- `holiday_snapshots`: snapshot completo del dataset
- `holiday_snapshot_items`: detalle por feriado dentro de cada snapshot
- `holidays_current`: tabla optimizada para lectura
- `schema_migrations`: control de migraciones aplicadas

## Variables de entorno

Tomadas de [`.env.example`](/media/work/OneDrive/Personal-Git/feriados-api/feriados-producer/.env.example):

- `PRODUCER_CRON`: cron del productor. Default `0 0 */12 * * *`
- `TIMEZONE`: default `America/Lima`
- `HOLIDAYS_SOURCE_URL`: origen del scraping
- `HTTP_TIMEOUT_MS`: timeout HTTP
- `HTTP_MAX_RETRIES`: retries del fetch base
- `USE_PLAYWRIGHT_FALLBACK`: habilita fallback de navegador
- `SNAPSHOT_RETENTION_DAYS`: retencion de snapshots no vigentes
- `SCRAPE_RUN_RETENTION_DAYS`: retencion de corridas historicas
- `QUERY_TRACE_RETENTION_DAYS`: retencion de trazas de consulta del API
- `REDIS_CACHE_TTL_SECONDS`: TTL de las claves Redis del snapshot actual
- `DATABASE_URL`: PostgreSQL
- `REDIS_URL`: Redis
- `PARSER_VERSION`: version del parser para auditoria

## Comandos utiles

```bash
npm run build
npm test
npm run migrate
npm run once
npm run cleanup
npm start
```

Que hace cada uno:

- `npm run migrate`: aplica migraciones SQL pendientes
- `npm run once`: ejecuta una corrida manual completa
- `npm run cleanup`: ejecuta solo la limpieza de retencion
- `npm start`: arranca el proceso cron compilado

Con `pm2`:

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
```

## Salida esperada de una corrida manual

`npm run once` imprime un resumen como este:

```json
{
  "ok": true,
  "usedBrowserFallback": false,
  "statusCode": 200,
  "holidayCount": 15,
  "sync": {
    "changed": false,
    "persisted": false,
    "cleanup": {
      "deletedRuns": 0,
      "deletedSnapshots": 0
    }
  }
}
```

Campos relevantes:

- `changed`: indica si el payload canonico cambio frente al snapshot actual
- `persisted`: indica si se escribio un nuevo snapshot
- `usedBrowserFallback`: indica si fue necesario usar Playwright
- `cleanup`: resume la limpieza aplicada al final de la corrida

## Robustez actual

- lock en PG para evitar ejecuciones concurrentes
- fallback a navegador ante `403/418` o HTML bloqueado
- logging estructurado con Pino
- audit trail tambien para scrapes fallidos
- shutdown limpio ante `SIGTERM` y `SIGINT`
- persistencia auditable de HTML crudo y payload normalizado
- refresh de Redis via pipeline
- TTL en cache Redis para evitar stale infinito si el productor deja de correr
- cleanup forward-only, sin rollback SQL automatico

## Testing

- unitarios:
  - parser
  - hash
  - sync con doubles
  - cleanup
- funcionales:
  - HTML bloqueado
  - fallback a navegador
  - fixture realista de `gob.pe`

## Estado actual

MVP operativo y validado contra `gob.pe`, PostgreSQL y Redis reales.
