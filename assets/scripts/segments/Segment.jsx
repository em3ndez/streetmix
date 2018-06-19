import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import MeasurementText from '../ui/MeasurementText'
import { CSSTransition } from 'react-transition-group'
import { getSegmentVariantInfo, getSegmentInfo } from '../segments/info'
import { normalizeSegmentWidth, RESIZE_TYPE_INITIAL, suppressMouseEnter, incrementSegmentWidth } from './resizing'
import { TILE_SIZE } from './constants'
import { drawSegmentContents, getVariantInfoDimensions } from './view'
import { SETTINGS_UNITS_METRIC } from '../users/constants'
import { infoBubble } from '../info_bubble/info_bubble'
import { INFO_BUBBLE_TYPE_SEGMENT } from '../info_bubble/constants'
import { KEYS } from '../app/keyboard_commands'
import { trackEvent } from '../app/event_tracking'
import { t } from '../locales/locale'

const WIDTH_PALETTE_MULTIPLIER = 4 // Dupe from palette.js
const SEGMENT_Y_NORMAL = 265
const SEGMENT_Y_PALETTE = 20
const CANVAS_HEIGHT = 480
const CANVAS_GROUND = 35
const CANVAS_BASELINE = CANVAS_HEIGHT - CANVAS_GROUND

class Segment extends React.Component {
  static propTypes = {
    type: PropTypes.string.isRequired,
    variantString: PropTypes.string.isRequired,
    randSeed: PropTypes.number,
    isUnmovable: PropTypes.bool.isRequired,
    width: PropTypes.number,
    forPalette: PropTypes.bool.isRequired,
    dpi: PropTypes.number,
    cssTransform: PropTypes.string,
    units: PropTypes.number,
    segmentPos: PropTypes.number,
    dataNo: PropTypes.number,
    updateSegmentData: PropTypes.func,
    updatePerspective: PropTypes.func,
    locale: PropTypes.string,
    suppressMouseEnter: PropTypes.bool.isRequired
  }

  static defaultProps = {
    units: SETTINGS_UNITS_METRIC,
    suppressMouseEnter: false
  }

  constructor (props) {
    super(props)

    this.state = {
      oldSegmentEnter: true,
      newSegmentEnter: false,
      switchSegments: false,
      oldSegmentVariant: ''
    }
  }

  componentDidMount = () => {
    this.drawSegment(this.props.variantString, false)

    if (!this.props.forPalette) {
      this.dragHandleLeft.segmentEl = this.streetSegment
      this.dragHandleRight.segmentEl = this.streetSegment
      this.props.updateSegmentData(this.streetSegment, this.props.dataNo, this.props.segmentPos)
    }
  }

  componentDidUpdate (prevProps, prevState) {
    if (this.props.forPalette) return

    this.drawSegment(this.props.variantString, false)

    if (prevProps.suppressMouseEnter && !this.props.suppressMouseEnter &&
        infoBubble.considerSegmentEl === this.streetSegment) {
      infoBubble.considerShowing(false, this.streetSegment, INFO_BUBBLE_TYPE_SEGMENT)
    }

    if (prevProps.variantString !== this.props.variantString) {
      this.switchSegments(prevProps.variantString)
    }

    if (this.state.switchSegments && prevState.switchSegments !== this.state.switchSegments) {
      this.drawSegment(this.state.oldSegmentVariant, true)
      this.updateOldCanvasLeftPos(this.state.oldSegmentVariant)
      this.props.updatePerspective(this.oldSegmentCanvas)
      this.props.updatePerspective(this.segmentCanvas)
    }

    this.props.updateSegmentData(this.streetSegment, this.props.dataNo, this.props.segmentPos)
  }

  drawSegment = (variantString, isOldSegment) => {
    const multiplier = this.props.forPalette ? (WIDTH_PALETTE_MULTIPLIER / TILE_SIZE) : 1
    const segmentWidth = this.props.width // may need to double check this. setSegmentContents() was called with other widths
    const offsetTop = this.props.forPalette ? SEGMENT_Y_PALETTE : SEGMENT_Y_NORMAL
    const canvas = (isOldSegment) ? this.oldSegmentCanvas : this.segmentCanvas
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSegmentContents(ctx, this.props.type, variantString, segmentWidth, 0, offsetTop, this.props.randSeed, multiplier, this.props.forPalette)
  }

  calculateSegmentWidths = (resizeType) => {
    let widthValue = this.props.width / TILE_SIZE
    if (!this.props.forPalette) {
      widthValue = normalizeSegmentWidth(widthValue, resizeType)
    }

    return {
      widthValue,
      width: widthValue * TILE_SIZE
    }
  }

  onSegmentMouseEnter = (event) => {
    if (this.props.suppressMouseEnter || suppressMouseEnter() || this.props.forPalette) return

    window.addEventListener('keydown', this.handleKeyDown)
    infoBubble.considerShowing(event, this.streetSegment, INFO_BUBBLE_TYPE_SEGMENT)
  }

  onSegmentMouseLeave = () => {
    window.removeEventListener('keydown', this.handleKeyDown)
    infoBubble.dontConsiderShowing()
  }

  handleKeyDown = (event) => {
    const negative = (event.keyCode === KEYS.MINUS) ||
      (event.keyCode === KEYS.MINUS_ALT) ||
      (event.keyCode === KEYS.MINUS_KEYPAD)

    const positive = (event.keyCode === KEYS.EQUAL) ||
      (event.keyCode === KEYS.EQUAL_ALT) ||
      (event.keyCode === KEYS.PLUS_KEYPAD)

    const metaCtrlAlt = (event.metaKey || event.ctrlKey || event.altKey)
    if (metaCtrlAlt || (!negative && !positive)) return

    const { widthValue } = this.calculateSegmentWidths(RESIZE_TYPE_INITIAL)
    incrementSegmentWidth(this.props.dataNo, !negative, event.shiftKey, widthValue)
    event.preventDefault()

    trackEvent('INTERACTION', 'CHANGE_WIDTH', 'KEYBOARD', null, true)
  }

  changeRefs = (ref, isOldSegment) => {
    if (!this.state.switchSegments && !isOldSegment) return

    if (this.state.switchSegments && isOldSegment) {
      this.oldSegmentCanvas = ref
    } else {
      this.segmentCanvas = ref
    }
  }

  switchSegments = (oldVariant) => {
    this.setState({
      switchSegments: !(this.state.switchSegments),
      newSegmentEnter: !(this.state.newSegmentEnter),
      oldSegmentEnter: !(this.state.oldSegmentEnter),
      oldSegmentVariant: oldVariant
    })
  }

  updateOldCanvasLeftPos = (oldVariant) => {
    const variantInfo = getSegmentVariantInfo(this.props.type, oldVariant)
    const dimensions = getVariantInfoDimensions(variantInfo, this.props.width, 1)
    const canvasLeft = (dimensions.left * TILE_SIZE)

    this.oldSegmentCanvas.style.left = canvasLeft + 'px'
  }

  renderSegmentCanvas = (width, variantInfo, segment) => {
    const isOldSegment = (segment === 'old')
    const canvasKey = (isOldSegment) ? this.state.oldSegmentVariant : this.props.variantString

    const multiplier = this.props.forPalette ? (WIDTH_PALETTE_MULTIPLIER / TILE_SIZE) : 1
    const dimensions = getVariantInfoDimensions(variantInfo, this.props.width, multiplier)
    const totalWidth = dimensions.right - dimensions.left
    // Canvas width and height must fit the div width in the palette to prevent extra right padding
    const canvasWidth = this.props.forPalette ? width * this.props.dpi : totalWidth * TILE_SIZE * this.props.dpi
    const canvasHeight = CANVAS_BASELINE * this.props.dpi
    const canvasStyle = {
      width: this.props.forPalette ? width : totalWidth * TILE_SIZE,
      height: CANVAS_BASELINE,
      left: (dimensions.left * TILE_SIZE * multiplier)
    }

    return (
      <div key={canvasKey}>
        <canvas className="image" ref={(ref) => { this.changeRefs(ref, isOldSegment) }} width={canvasWidth} height={canvasHeight} style={canvasStyle} />
        <div className="hover-bk" />
      </div>
    )
  }

  render () {
    const segmentInfo = getSegmentInfo(this.props.type)
    const variantInfo = getSegmentVariantInfo(this.props.type, this.props.variantString)
    const defaultName = variantInfo.name || segmentInfo.name // the name to display if there isn't a localized version of it
    const nameKey = variantInfo.nameKey || segmentInfo.nameKey

    // Get localized names from store, fall back to segment default names if translated
    // text is not found. TODO: port to react-intl/formatMessage later.
    const displayName = t(`segments.${nameKey}`, defaultName, { ns: 'segment-info' })
    const localizedSegmentName = t(`segments.${segmentInfo.nameKey}`, defaultName, { ns: 'segment-info' })

    const segmentWidths = this.calculateSegmentWidths(RESIZE_TYPE_INITIAL)
    const { width, widthValue } = segmentWidths

    const segmentStyle = {
      width: width + 'px',
      // In a street, certain segments have stacking priority over others (expressed as z-index).
      // In a palette, segments are side-by-side so they don't need stacking priority.
      // Setting a z-index here will clobber a separate z-index (applied via CSS) when hovered by mouse pointer
      zIndex: (this.props.forPalette) ? null : segmentInfo.zIndex,
      [this.props.cssTransform]: (this.props.forPalette) ? null : 'translateX(' + this.props.segmentPos + 'px)'
    }

    const dataAttributes = {
      type: this.props.type,
      'variant-string': this.props.variantString,
      'rand-seed': this.props.randSeed,
      'data-width': widthValue
    }

    return (
      <div
        style={segmentStyle}
        className={'segment' + (this.props.isUnmovable ? ' unmovable' : '') + (this.props.forPalette ? ' segment-in-palette' : '')}
        {...dataAttributes}
        title={this.props.forPalette ? localizedSegmentName : null}
        ref={(ref) => { this.streetSegment = ref }}
        onMouseEnter={this.onSegmentMouseEnter}
        onMouseLeave={this.onSegmentMouseLeave}
      >
        {!this.props.forPalette &&
          <React.Fragment>
            <span className="name">
              {displayName}
            </span>
            <span className="width">
              <MeasurementText value={widthValue} units={this.props.units} locale={this.props.locale} />
            </span>
            <span className="drag-handle left" ref={(ref) => { this.dragHandleLeft = ref }}>‹</span>
            <span className="drag-handle right" ref={(ref) => { this.dragHandleRight = ref }}>›</span>
            <span className={'grid' + (this.props.units === SETTINGS_UNITS_METRIC ? ' units-metric' : ' units-imperial')} />
          </React.Fragment>
        }
        <React.Fragment>
          <CSSTransition
            key="old-segment"
            in={this.state.oldSegmentEnter}
            timeout={250}
            classNames="switching-away"
            unmountOnExit
          >
            {this.renderSegmentCanvas(width, variantInfo, 'old')}
          </CSSTransition>
          {!this.props.forPalette &&
            <CSSTransition
              key="new-segment"
              in={this.state.newSegmentEnter}
              timeout={250}
              classNames="switching-in"
              onEntered={this.switchSegments}
              unmountOnExit
            >
              {this.renderSegmentCanvas(width, variantInfo, 'new')}
            </CSSTransition>
          }
        </React.Fragment>
      </div>
    )
  }
}

function mapStateToProps (state) {
  return {
    dpi: state.system.hiDpi,
    cssTransform: state.system.cssTransform,
    locale: state.locale.locale,
    redrawCanvas: state.flags.DEBUG_SEGMENT_CANVAS_RECTANGLES.value
  }
}

export default connect(mapStateToProps)(Segment)
