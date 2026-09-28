<template>
  <div class="ui-robot-controller-wrapper">
    <iframe
      v-if="robotId"
      class="ui-robot-controller-frame"
      :src="pendantUrl"
      title="Robot teach pendant"
    />
    <div v-else class="ui-robot-controller-empty">
      Select a <strong>robot</strong> node in the widget properties.
    </div>
  </div>
</template>

<script>
export default {
  name: 'UIRobotController',
  inject: ['$dataTracker'],
  props: {
    id: { type: String, required: true },
    props: { type: Object, default: () => ({}) },
    state: { type: Object, default: () => ({ enabled: false, visible: false }) }
  },
  computed: {
    robotId () {
      return (this.props && this.props.robot) || ''
    },
    pendantUrl () {
      return this.robotId ? `/robot-arm/pendant/${encodeURIComponent(this.robotId)}` : ''
    }
  },
  created () {
    this.$dataTracker(this.id)
  }
}
</script>

<style scoped>
.ui-robot-controller-wrapper {
  width: 100%;
  height: 100%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 6px;
  background: #0f1419;
}
.ui-robot-controller-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 280px;
  border: 0;
  background: #0f1419;
}
.ui-robot-controller-empty {
  padding: 16px;
  color: #8b9bb4;
  font-size: 13px;
}
</style>
