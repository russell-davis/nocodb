import Knex from 'knex'
import ClientPgLite from 'knex-pglite'
import type { z } from 'zod'
import {
  ncBaseUsersV2Schema,
  ncBasesV2Schema,
  ncCalendarViewColumnsV2Schema,
  ncCalendarViewRangeV2Schema,
  ncCalendarViewV2Schema,
  ncColBarcodeV2Schema,
  ncColButtonV2Schema,
  ncColFormulaV2Schema,
  ncColLongTextV2Schema,
  ncColLookupV2Schema,
  ncColQrcodeV2Schema,
  ncColRelationsV2Schema,
  ncColRollupV2Schema,
  ncColSelectOptionsV2Schema,
  ncColumnsV2Schema,
  ncDataReflectionSchema,
  ncDisabledModelsForRoleV2Schema,
  ncExtensionsSchema,
  ncFilterExpV2Schema,
  ncFormViewColumnsV2Schema,
  ncFormViewV2Schema,
  ncGalleryViewColumnsV2Schema,
  ncGalleryViewV2Schema,
  ncGridViewColumnsV2Schema,
  ncGridViewV2Schema,
  ncHooksV2Schema,
  ncIntegrationsV2Schema,
  ncJobsSchema,
  ncKanbanViewColumnsV2Schema,
  ncKanbanViewV2Schema,
  ncMapViewColumnsV2Schema,
  ncMapViewV2Schema,
  ncModelsV2Schema,
  ncSharedViewsV2Schema,
  ncSortV2Schema,
  ncSourcesV2Schema,
  ncSyncConfigsSchema,
  ncViewsV2Schema,
  syncMetadataSchema,
} from './schema'
import { MetaTable } from '.'
import MigrationSource from '~/db/MigrationSource'
import { CustomMigrator } from '~/db/CustomMigrator'

const instance = Knex({
  client: ClientPgLite,
  dialect: 'postgres',
  connection: { connectionString: 'idb://nocodb' },
})

// Table to Zod schema mapping
const TABLE_SCHEMAS: { [key: string]: z.ZodSchema } = {
  [MetaTable.PROJECT]: ncBasesV2Schema,
  [MetaTable.SOURCES]: ncSourcesV2Schema,
  [MetaTable.MODELS]: ncModelsV2Schema,
  [MetaTable.COLUMNS]: ncColumnsV2Schema,
  [MetaTable.COL_RELATIONS]: ncColRelationsV2Schema,
  [MetaTable.COL_SELECT_OPTIONS]: ncColSelectOptionsV2Schema,
  [MetaTable.COL_LOOKUP]: ncColLookupV2Schema,
  [MetaTable.COL_ROLLUP]: ncColRollupV2Schema,
  [MetaTable.COL_FORMULA]: ncColFormulaV2Schema,
  [MetaTable.COL_QRCODE]: ncColQrcodeV2Schema,
  [MetaTable.COL_BARCODE]: ncColBarcodeV2Schema,
  [MetaTable.COL_LONG_TEXT]: ncColLongTextV2Schema,
  [MetaTable.FILTER_EXP]: ncFilterExpV2Schema,
  [MetaTable.SORT]: ncSortV2Schema,
  [MetaTable.SHARED_VIEWS]: ncSharedViewsV2Schema,
  [MetaTable.FORM_VIEW]: ncFormViewV2Schema,
  [MetaTable.FORM_VIEW_COLUMNS]: ncFormViewColumnsV2Schema,
  [MetaTable.GALLERY_VIEW]: ncGalleryViewV2Schema,
  [MetaTable.GALLERY_VIEW_COLUMNS]: ncGalleryViewColumnsV2Schema,
  [MetaTable.CALENDAR_VIEW]: ncCalendarViewV2Schema,
  [MetaTable.CALENDAR_VIEW_COLUMNS]: ncCalendarViewColumnsV2Schema,
  [MetaTable.CALENDAR_VIEW_RANGE]: ncCalendarViewRangeV2Schema,
  [MetaTable.GRID_VIEW]: ncGridViewV2Schema,
  [MetaTable.GRID_VIEW_COLUMNS]: ncGridViewColumnsV2Schema,
  [MetaTable.KANBAN_VIEW]: ncKanbanViewV2Schema,
  [MetaTable.KANBAN_VIEW_COLUMNS]: ncKanbanViewColumnsV2Schema,
  [MetaTable.VIEWS]: ncViewsV2Schema,
  [MetaTable.HOOKS]: ncHooksV2Schema,
  [MetaTable.PROJECT_USERS]: ncBaseUsersV2Schema,
  [MetaTable.MODEL_ROLE_VISIBILITY]: ncDisabledModelsForRoleV2Schema,
  [MetaTable.MAP_VIEW]: ncMapViewV2Schema,
  [MetaTable.MAP_VIEW_COLUMNS]: ncMapViewColumnsV2Schema,
  [MetaTable.EXTENSIONS]: ncExtensionsSchema,
  [MetaTable.JOBS]: ncJobsSchema,
  [MetaTable.INTEGRATIONS]: ncIntegrationsV2Schema,
  [MetaTable.COL_BUTTON]: ncColButtonV2Schema,
  [MetaTable.DATA_REFLECTION]: ncDataReflectionSchema,
  [MetaTable.SYNC_CONFIGS]: ncSyncConfigsSchema,
  sync_metadata: syncMetadataSchema,
}

export class MetadataManager {
  constructor() {
    this.initSchema()
  }

  async initSchema() {
    try {
      const migrator = new CustomMigrator(instance, new MigrationSource(), 'xc_migrations')
      await migrator.latest()
    } catch (err) {
      console.error('Schema initialization failed:', err)
      throw err
    }
  }

  async bootstrap(workspace_id: string, base_id: string) {
    try {
      const response = await fetch(`/api/metadata?workspace_id=${workspace_id}&base_id=${base_id}`)
      const records = await response.json()

      for (const table of Object.keys(TABLE_SCHEMAS)) {
        if (table === 'sync_metadata') continue
        const tableRecords = records.filter((r: any) => r.table_name === table)
        await instance(table).where({ base_id }).delete()
        if (tableRecords.length > 0) {
          const batchSize = 1000
          for (let i = 0; i < tableRecords.length; i += batchSize) {
            await instance(table).insert(tableRecords.slice(i, i + batchSize))
          }
        }
      }
    } catch (err) {
      console.error('Bootstrap failed:', err)
      throw err
    }
  }

  async applyEvent(event: {
    type: string
    data: { target: MetaTable; payload: any; eventId: string; workspace_id: string; base_id: string }
  }) {
    try {
      const { type, data } = event
      const { target, payload, eventId, workspace_id, base_id } = data

      if (!TABLE_SCHEMAS[target]) {
        throw new Error(`Unknown or unsupported metadata table: ${target}`)
      }

      if (type === 'META_INSERT') {
        await instance(target).insert(payload)
      } else if (type === 'META_UPDATE') {
        const primaryKey = target === MetaTable.PROJECT_USERS ? { base_id, fk_user_id: payload.fk_user_id } : { id: payload.id }
        await instance(target)
          .where({ ...primaryKey, base_id })
          .update(payload)
      } else if (type === 'META_DELETE') {
        const primaryKey = target === MetaTable.PROJECT_USERS ? { base_id, fk_user_id: payload.fk_user_id } : { id: payload.id }
        await instance(target)
          .where({ ...primaryKey, base_id })
          .delete()
      }

      await instance('sync_metadata')
        .insert({
          workspace_id,
          base_id,
          last_event_id: eventId,
          last_sync_timestamp: new Date().toISOString(),
        })
        .onConflict(['workspace_id', 'base_id'])
        .merge()
    } catch (err) {
      console.error('Apply event failed:', err)
      throw err
    }
  }

  async syncMissedEvents(workspace_id: string, base_id: string, offset = 0, limit = 1000) {
    try {
      const syncData = await instance('sync_metadata').where({ workspace_id, base_id }).first()
      if (!syncData?.last_event_id) return

      const response = await fetch('/api/sync-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id,
          base_id,
          since: syncData.last_event_id,
          sinceType: 'event_id',
          offset,
          limit,
        }),
      })
      const events = await response.json()

      for (const event of events) {
        await this.applyEvent({
          type: event.operation,
          data: {
            target: event.target as MetaTable,
            payload: event.payload,
            eventId: event.id,
            workspace_id,
            base_id,
          },
        })
      }

      if (events.length === limit) {
        await this.syncMissedEvents(workspace_id, base_id, offset + limit, limit)
      }
    } catch (err) {
      console.error('Sync missed events failed:', err)
      throw err
    }
  }

  getKnex() {
    return instance
  }
}

export const metadataManager = new MetadataManager()
