import { metadataManager } from '~/db/MetaManager'

const useRealtime = createSharedComposable(() => {
  const { $realtime } = useNuxtApp()

  const { activeProjectId } = storeToRefs(useBases())

  onMounted(() => {
    if (activeProjectId?.value) {
      $realtime.subscribe('nc', activeProjectId.value)
    }
  })

  watch(activeProjectId, async (newBaseId, oldBaseId) => {
    if (oldBaseId) {
      $realtime.unsubscribe('nc', oldBaseId)
    }
    if (newBaseId) {
      $realtime.subscribe('nc', newBaseId)
      await metadataManager.bootstrap('nc', newBaseId)
    }
  })

  $realtime.on(async (e) => {
    await metadataManager.applyEvent(e)
    console.log(e)
  })

  return {
    metadataManager,
  }
})

export default useRealtime
