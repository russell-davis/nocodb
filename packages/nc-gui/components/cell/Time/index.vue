<script setup lang="ts">
import dayjs from 'dayjs'
import { isSystemColumn } from 'nocodb-sdk'

interface Props {
  modelValue?: string | null | undefined
  isPk?: boolean
}

const { modelValue, isPk } = defineProps<Props>()

const emit = defineEmits(['update:modelValue'])

const { isMysql } = useBase()

const { showNull } = useGlobal()

const readOnly = inject(ReadonlyInj, ref(false))

const rawReadOnly = inject(RawReadonlyInj, ref(false))

const active = inject(ActiveCellInj, ref(false))

const editable = inject(EditModeInj, ref(false))

const isEditColumn = inject(EditColumnInj, ref(false))

const isGrid = inject(IsGridInj, ref(false))

const isForm = inject(IsFormInj, ref(false))

const isSurveyForm = inject(IsSurveyFormInj, ref(false))

const isExpandedForm = inject(IsExpandedFormOpenInj, ref(false))

const column = inject(ColumnInj)!

const dateFormat = isMysql(column.value.source_id) ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD HH:mm:ssZ'

const isTimeInvalid = ref(false)

const datePickerRef = ref<HTMLInputElement>()

const isClearedInputMode = ref<boolean>(false)

const { t } = useI18n()

const open = ref(false)

const tempDate = ref<dayjs.Dayjs | undefined>()

const localState = computed({
  get() {
    if (!modelValue || isClearedInputMode.value) {
      return undefined
    }
    let convertingValue = modelValue
    const valueNumber = Number(modelValue)
    if (!isNaN(valueNumber)) {
      // FIXME: currently returned value is in minutes
      // so need to * 60 and need to be removed if changed to seconds
      convertingValue = convertMS2Duration(valueNumber * 60, 1)
    }
    let dateTime = dayjs(convertingValue)

    if (!dateTime.isValid()) {
      dateTime = dayjs(convertingValue, 'HH:mm:ss')
    }
    if (!dateTime.isValid()) {
      dateTime = dayjs(`1999-01-01 ${convertingValue}`)
    }
    if (!dateTime.isValid()) {
      isTimeInvalid.value = true
      return undefined
    }

    return dateTime
  },
  set(val?: dayjs.Dayjs) {
    isClearedInputMode.value = false

    saveChanges(val)
  },
})

const savingValue = ref()

function saveChanges(val?: dayjs.Dayjs) {
  if (!val) {
    if (savingValue.value === val) {
      return
    }

    savingValue.value = null

    emit('update:modelValue', null)
    return
  }

  if (val.isValid()) {
    const time = val.format('HH:mm')
    const date = dayjs(`1999-01-01 ${time}:00`)

    const formattedValue = date.format(dateFormat)

    if (savingValue.value === formattedValue) {
      return
    }

    savingValue.value = formattedValue
    emit('update:modelValue', date.format(dateFormat))
  }
}

watchEffect(() => {
  if (localState.value) {
    tempDate.value = localState.value
  }
})

const handleUpdateValue = (e: Event, save = false) => {
  let targetValue = (e.target as HTMLInputElement).value

  if (!targetValue) {
    tempDate.value = undefined
    return
  }

  targetValue = parseProp(column.value.meta).is12hrFormat
    ? targetValue
        .trim()
        .toUpperCase()
        .replace(/(AM|PM)$/, ' $1')
        .replace(/\s+/g, ' ')
    : targetValue.trim()

  const parsedDate = dayjs(targetValue, parseProp(column.value.meta).is12hrFormat ? 'hh:mm A' : 'HH:mm')

  if (parsedDate.isValid()) {
    tempDate.value = dayjs(`${dayjs().format('YYYY-MM-DD')} ${parsedDate.format('HH:mm')}`)

    if (save) {
      saveChanges(tempDate.value)
    }
  }
}

const randomClass = `picker_${Math.floor(Math.random() * 99999)}`

onClickOutside(datePickerRef, (e) => {
  if ((e.target as HTMLElement)?.closest(`.${randomClass}, .nc-${randomClass}`)) return
  datePickerRef.value?.blur?.()
  open.value = false
})

const onBlur = (e) => {
  handleUpdateValue(e, true)

  if (
    (e?.relatedTarget as HTMLElement)?.closest(`.${randomClass}, .nc-${randomClass}`) ||
    (e?.target as HTMLElement)?.closest(`.${randomClass}, .nc-${randomClass}`)
  ) {
    return
  }

  open.value = false
}

const onFocus = () => {
  open.value = true
}

watch(
  open,
  (next) => {
    if (next) {
      editable.value = true
      datePickerRef.value?.focus?.()

      onClickOutside(document.querySelector(`.${randomClass}`)! as HTMLDivElement, (e) => {
        if ((e?.target as HTMLElement)?.closest(`.nc-${randomClass}`)) {
          return
        }
        open.value = false
      })
    } else {
      isClearedInputMode.value = false
    }
  },
  { flush: 'post' },
)

watch(editable, (nextValue) => {
  if (isGrid.value && nextValue && !open.value) {
    open.value = true
  }
})

const placeholder = computed(() => {
  if (
    ((isForm.value || isExpandedForm.value) && !isTimeInvalid.value) ||
    (isGrid.value && !showNull.value && !isTimeInvalid.value && !isSystemColumn(column.value) && active.value) ||
    isEditColumn.value
  ) {
    return parseProp(column.value.meta).is12hrFormat ? 'hh:mm AM' : 'HH:mm'
  } else if (modelValue === null && showNull.value) {
    return t('general.null').toUpperCase()
  } else if (isTimeInvalid.value) {
    return t('msg.invalidTime')
  } else {
    return ''
  }
})

const isOpen = computed(() => {
  if (readOnly.value) return false

  return (readOnly.value || (localState.value && isPk)) && !active.value && !editable.value ? false : open.value
})

const clickHandler = () => {
  if (readOnly.value || open.value) return
  open.value = active.value || editable.value
}

const handleKeydown = (e: KeyboardEvent, _open?: boolean) => {
  if (e.key !== 'Enter') {
    e.stopPropagation()
  }

  switch (e.key) {
    case 'Enter':
      e.preventDefault()
      if (isSurveyForm.value) {
        e.stopPropagation()
      }

      localState.value = tempDate.value
      open.value = !_open
      if (!open.value) {
        if (isGrid.value && !isExpandedForm.value && !isEditColumn.value) {
          editable.value = false
          datePickerRef.value?.blur?.()
        }
      }
      return

    case 'Tab':
      open.value = false
      if (isGrid.value && !isExpandedForm.value && !isEditColumn.value) {
        editable.value = false
        datePickerRef.value?.blur?.()
      }

      return
    case 'Escape':
      if (_open) {
        open.value = false

        if (isGrid.value && !isExpandedForm.value && !isEditColumn.value) {
          editable.value = false
          datePickerRef.value?.blur?.()
        }
      } else {
        editable.value = false

        datePickerRef.value?.blur?.()
      }
      return
    default:
      if (!_open && /^[0-9a-z]$/i.test(e.key)) {
        open.value = true
        const targetEl = e.target as HTMLInputElement
        const value = targetEl.value

        nextTick(() => {
          targetEl.value = value
        })
      }
  }
}

useEventListener(document, 'keydown', (e: KeyboardEvent) => {
  // To prevent event listener on non active cell
  if (!active.value) return

  if (e.altKey || e.shiftKey || !isGrid.value || isExpandedForm.value || isEditColumn.value || isExpandedFormOpenExist()) {
    return
  }

  if (e.metaKey || e.ctrlKey) {
    if (e.key === ';') {
      if (isGrid.value && !isExpandedForm.value && !isEditColumn.value) {
        localState.value = dayjs(new Date())
        e.preventDefault()
      }
    } else return
  }

  if (!isOpen.value && datePickerRef.value && /^[0-9a-z]$/i.test(e.key)) {
    isClearedInputMode.value = true
    datePickerRef.value.focus()
    editable.value = true
    open.value = true
  }
})

function handleSelectTime(value?: dayjs.Dayjs) {
  if (!value) {
    tempDate.value = undefined
    localState.value = undefined
  }
  if (!value?.isValid()) return

  if (localState.value) {
    const dateTime = dayjs(`${localState.value.format('YYYY-MM-DD')} ${value.format('HH:mm')}:00`)
    tempDate.value = dateTime
    localState.value = dateTime
  } else {
    const dateTime = dayjs(`${dayjs().format('YYYY-MM-DD')} ${value.format('HH:mm')}:00`)
    tempDate.value = dateTime
    localState.value = dateTime
  }

  open.value = false
}

const cellValue = computed(() => localState.value?.format(parseProp(column.value.meta).is12hrFormat ? 'hh:mm A' : 'HH:mm') ?? '')
</script>

<template>
  <NcDropdown
    :visible="isOpen"
    :auto-close="false"
    :trigger="['click']"
    class="nc-cell-field"
    :class="[`nc-${randomClass}`, { 'nc-null': modelValue === null && showNull }]"
    :overlay-class-name="`${randomClass} nc-picker-time ${isOpen ? 'active' : ''} !min-w-[0]`"
  >
    <div
      v-bind="$attrs"
      :title="localState?.format('HH:mm')"
      class="nc-time-picker h-full flex items-center justify-between ant-picker-input relative"
    >
      <input
        v-if="!rawReadOnly"
        ref="datePickerRef"
        type="text"
        :value="cellValue"
        :placeholder="placeholder"
        class="nc-time-input border-none outline-none !text-current bg-transparent !focus:(border-none outline-none ring-transparent)"
        :readonly="readOnly"
        @blur="onBlur"
        @focus="onFocus"
        @keydown="handleKeydown($event, isOpen)"
        @mouseup.stop
        @mousedown.stop
        @click="clickHandler"
        @input="handleUpdateValue"
      />
      <span v-else>
        {{ cellValue }}
      </span>

      <GeneralIcon
        v-if="localState && !readOnly"
        icon="closeCircle"
        class="nc-clear-time-icon nc-action-icon absolute right-0 top-[50%] transform -translate-y-1/2 invisible cursor-pointer"
        @click.stop="handleSelectTime()"
      />
    </div>

    <template #overlay>
      <div class="min-w-[120px]">
        <NcTimeSelector
          :selected-date="localState"
          :min-granularity="30"
          is-min-granularity-picker
          :is12hr-format="!!parseProp(column.meta).is12hrFormat"
          :is-open="isOpen"
          @update:selected-date="handleSelectTime"
        />
      </div>
    </template>
  </NcDropdown>
  <div v-if="!editable && isGrid" class="absolute inset-0 z-90 cursor-pointer"></div>
</template>

<style scoped lang="scss">
.nc-cell-field {
  &:hover .nc-clear-time-icon {
    @apply visible;
  }
}
</style>
