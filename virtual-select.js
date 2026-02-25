'use strict';

class VirtualSelect extends HTMLElement {
  constructor() {
    super();

    // Bind methods
    this._handleBlur = this._handleBlur.bind(this);
    this._handleClick = this._handleClick.bind(this);
    this._handleCanvasClick = this._handleCanvasClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleScroll = this._handleScroll.bind(this);
    this._handleDocumentMouseDown = this._handleDocumentMouseDown.bind(this);
    this._handleDocumentMouseMove = this._handleDocumentMouseMove.bind(this);
    this._handleDocumentMouseUp = this._handleDocumentMouseUp.bind(this);
    this._handleCanvasMouseDown = this._handleCanvasMouseDown.bind(this);

    // Component state
    this.isOpen = false;
    this.visibleItems = 10; // Number of visible items
    this.dropDownWidth = 0;

    this._items = [];
    this._selectedIndex = -1;
    this._lastSelectedIndex = -1;
    this._minScrollbarHeight = 15; // minimum thumb height in pixels
    this._scrollOffset = 0;
    this._draggingScrollbar = false;
    this._scrollbar = { x: 0, y: 0, width: 6, height: 0 };
    this._dragStartY = 0;
    this._dragStartOffset = 0;
    this._styles = getComputedStyle(this);
    this._placeholder = this.getAttribute('placeholder') || '';
    this._disabled = this.getAttribute('disabled') !== null;
    this._noRender = false;

    // Internal structure
    const root = this.attachShadow({ mode: 'open' });
    const styles = `
      <style>
        :host {
          position: relative;
          display: inline-block;
          width: 300px;
          font: 14px Arial, sans-serif;
          background-color: white;
          border-radius: 4px;
        }

        :host([disabled]) .select-header {
          opacity: 0.6;
          pointer-events: none;
        }

        .select-header {
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 3px 6px;
          background-color: inherit;
          display: flex;
          justify-content: space-between;
          align-items: center;
          user-select: none;
          overflow: hidden;
        }

        .select-header * {
          pointer-events: none;
        }

        .select-header:hover {
          outline: 1px solid #666;
        }

        .select-header.open {
          outline: 1px solid #0066cc;
          border-radius: 0;
        }

        .arrow {
          border: solid #666;
          border-width: 0 2px 2px 0;
          display: inline-block;
          padding: 3px;
          transition: transform 0.1s;
        }

        .arrow.down {
          transform: rotate(45deg);
        }

        .arrow.up {
          transform: rotate(-135deg);
        }

        canvas {
          position: absolute;
          left: -1px;
          right: 0;
          border: 1px solid #0066cc;
          background-color: inherit;
          z-index: 1000;
          box-shadow: 4px 4px 6px rgba(0,0,0,0.1);
        }

        .placeholder {
          color: #999;
          min-height: 1em;
        }

        .selected-value {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        #patch {
          position: absolute;
          left: 0;
          height: 1px;
          background-color: #ddd;
          pointer-events: none;
          z-index: 1000;
          display: none;
        }

        .select-header.open ~ #patch {
          display: block;
        }
      </style>
    `;
    root.innerHTML = `
      ${styles}
      <div class=select-header>
        <span class=placeholder>${this._placeholder}</span>
        <i></i>
      </div>
      <canvas></canvas>
      <span id=patch></span>
    `;
  }

  static get observedAttributes() {
    return ['placeholder', 'disabled'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'placeholder') {
      this._placeholder = newValue;
    } else if (name === 'disabled') {
      this.disabled = newValue !== null;
    }
  }

  connectedCallback() {
    this.render();
    this.shadowRoot.addEventListener('click', this._handleClick);
    this.addEventListener('blur', this._handleBlur);
    document.addEventListener('keydown', this._handleKeyDown);
    document.addEventListener('mousedown', this._handleDocumentMouseDown);
    document.addEventListener('mousemove', this._handleDocumentMouseMove);
    document.addEventListener('mouseup', this._handleDocumentMouseUp);

    const canvas = this.shadowRoot.querySelector('canvas');
    canvas.addEventListener('click', this._handleCanvasClick);
    canvas.addEventListener('wheel', this._handleScroll);
    canvas.addEventListener('mousedown', this._handleCanvasMouseDown);

    this.setAttribute('tabindex', '0');
  }

  disconnectedCallback() {
    this.shadowRoot.removeEventListener('click', this._handleClick);
    this.removeEventListener('blur', this._handleBlur);
    document.removeEventListener('keydown', this._handleKeyDown);
    document.removeEventListener('mousedown', this._handleDocumentMouseDown);
    document.removeEventListener('mousemove', this._handleDocumentMouseMove);
    document.removeEventListener('mouseup', this._handleDocumentMouseUp);

    const canvas = this.shadowRoot.querySelector('canvas');
    canvas.removeEventListener('click', this._handleCanvasClick);
    canvas.removeEventListener('wheel', this._handleScroll);
    canvas.removeEventListener('mousedown', this._handleCanvasMouseDown);
  }

  _handleBlur() {
    if (this._selectedIndex !== this._lastSelectedIndex) {
      this._selectedIndex = this._lastSelectedIndex;
      this.render();
    }
  }

  _handleClick(event) {
    if (event.target.classList.contains('select-header')) {
      this.toggleDropDown();
    }
  }

  _handleDocumentMouseDown(event) {
    if (!this.isOpen) return;

    if (event.target !== this && !this.shadowRoot.contains(event.target)) {
      this.closeDropDown();
    }
  }

  _handleKeyDown(event) {
    if (this !== document.activeElement) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this._items.length === 0) break;
        this._selectedIndex = Math.min(this._items.length - 1, this._selectedIndex + 1);
        this.ensureVisible(this._selectedIndex);
        this.render();
        if (!this.isOpen) {
          this._selectItem(this._selectedIndex);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this._items.length === 0) break;
        this._selectedIndex = Math.max(0, this._selectedIndex - 1);
        this.ensureVisible(this._selectedIndex);
        this.render();
        if (!this.isOpen) {
          this._selectItem(this._selectedIndex);
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (this.isOpen) {
          if (!this.isOpen) break;
          this._selectItem(this._selectedIndex);
        } else {
          this.showDropDown();
        }
        break;
      case ' ':
        event.preventDefault();
        if (!this.isOpen) {
          this.showDropDown();
        }
        break;
      case 'Tab':
        if (this.isOpen) {
          event.preventDefault();
          this.closeDropDown();
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (this.isOpen) {
          this.closeDropDown();
        } else {
          this.blur();
        }
        break;
      default:
        if (this.isOpen) {
          event.preventDefault();
          if (event.repeat) return;
          const key = event.key.toLowerCase();
          const index = this._items.findIndex(item => key === item.toString()[0]?.toLowerCase());
          if (index >= 0) {
            this._selectedIndex = index;
            this.ensureVisible(index);
            this.render();
          }
        }
        break;
    }
  }

  _handleScroll(event) {
    const scrollTop = event.deltaY;
    this._scrollOffset = Math.max(0, Math.min(
      this._scrollOffset + scrollTop,
      this._items.length * this._itemHeight - this.visibleItems * this._itemHeight
    ));
    this._renderCanvas();
  }

  _handleCanvasClick(event) {
    if (!this.isOpen) return;
    if (this._draggingScrollbar) return;

    const rect = event.target.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const x = event.clientX - rect.left;
    const width = event.target.width || rect.width;
    // If click in scrollbar area, treat as track click (jump)
    if (this._items.length > this.visibleItems && x >= width - this._scrollbar.width - 6) {
      const canvas = event.target;
      const maxScroll = (this._items.length - this.visibleItems) * this._itemHeight;
      this._scrollOffset = Math.max(0, Math.min(maxScroll, Math.floor(y / canvas.height * maxScroll)));
      this._renderCanvas();
      return;
    }

    const clickedIndex = Math.floor((this._scrollOffset + y) / this._itemHeight);
    if (clickedIndex >= 0 && clickedIndex < this._items.length) {
      this._selectItem(clickedIndex);
    }
  }

  _handleCanvasMouseDown(event) {
    if (!this.isOpen) return;
    if (this._items.length <= this.visibleItems) return;

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { width, height } = canvas;

    const scrollbarXStart = (this._scrollbar.x || (width - 6)) - 6;
    const scrollbarY = this._scrollbar.y || 0;
    const scrollbarH = this._scrollbar.height
      || Math.max(this._minScrollbarHeight, this.visibleItems / this._items.length * height);

    // Click inside scrollbar thumb
    if (x >= scrollbarXStart && y >= scrollbarY && y <= scrollbarY + scrollbarH) {
      this._draggingScrollbar = true;
      this._dragStartY = y;
      this._dragStartOffset = this._scrollOffset;
      event.preventDefault();
      return;
    }

    // Click on track handled by click handler; nothing more here
  }

  _handleDocumentMouseMove(event) {
    if (!this._draggingScrollbar) return;
    event.preventDefault();

    const canvas = this.shadowRoot.querySelector('canvas');
    const height = canvas.height;
    const y = event.clientY - canvas.getBoundingClientRect().top;

    const totalContentHeight = this._items.length * this._itemHeight;
    const visibleContentHeight = this.visibleItems * this._itemHeight;
    const maxScroll = Math.max(0, totalContentHeight - visibleContentHeight);
    const deltaY = y - this._dragStartY;
    const trackHeight = Math.max(1, height - (this._scrollbar.height || this._minScrollbarHeight));
    const newOffset = this._dragStartOffset + Math.round(deltaY / trackHeight * maxScroll);
    this._scrollOffset = Math.max(0, Math.min(maxScroll, newOffset));
    this._renderCanvas();
  }

  _handleDocumentMouseUp() {
    if (this._draggingScrollbar) {
      setTimeout(() => this._draggingScrollbar = false, 0); // after onclick
    }
  }

  showDropDown() {
    if (this.isOpen || this._disabled) return;
    this._noRender = true;
    this.dispatchEvent(new Event('beforeopen'));
    this._noRender = false;
    this.isOpen = true;
    this.shadowRoot.querySelector('.select-header').classList.add('open');
    this._itemHeight = this._styles.fontSize
      ? parseFloat(this._styles.fontSize) + 12
      : 26; // Height of a single item in pixels
    let offsetIndex = this._selectedIndex - (this.visibleItems >> 1);
    if (offsetIndex < 0) {
      offsetIndex = 0;
    } else if (offsetIndex > this._items.length - this.visibleItems) {
      offsetIndex = this._items.length - this.visibleItems;
    }
    this._scrollOffset = offsetIndex * this._itemHeight;
    this.render();
  }

  closeDropDown(saveSelection = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.shadowRoot.querySelector('.select-header').classList.remove('open');
    if (!saveSelection) {
      this._selectedIndex = this._lastSelectedIndex;
    }
    this.render();
  }

  toggleDropDown() {
    if (this.isOpen) {
      this.closeDropDown();
    } else {
      this.showDropDown();
    }
  }

  _selectItem(index) {
    if (!this.dispatchEvent(new CustomEvent('beforechange', {
      cancelable: true,
      detail: { index }
    }))) return false;

    this._selectedIndex = index;
    if (this.isOpen) {
      this.closeDropDown(true);
    }

    if (this._selectedIndex !== this._lastSelectedIndex) {
      this._lastSelectedIndex = this._selectedIndex;
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }

    return true;
  }

  render() {
    if (this._noRender) return;

    const selectedLabel = this._selectedIndex >= 0 && this._items[this._selectedIndex] 
      ? this._items[this._selectedIndex] 
      : null;

    const span = this.shadowRoot.querySelector('span');
    if (selectedLabel) {
      span.className = 'selected-value';
      span.textContent = selectedLabel;
    } else {
      span.className = 'placeholder';
      span.textContent = this._placeholder;
    }

    this.shadowRoot.querySelector('i').className = this.isOpen ? 'arrow up' : 'arrow down';
    const canvas = this.shadowRoot.querySelector('canvas');
    canvas.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) {
      const desiredHeight = this._itemHeight * Math.max(1, Math.min(this._items.length, this.visibleItems));
      const rect = this.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let placeAbove = false;
      let finalHeight = desiredHeight;

      if (spaceBelow >= desiredHeight) {
        placeAbove = false;
        finalHeight = desiredHeight;
      } else if (spaceAbove >= desiredHeight) {
        placeAbove = true;
        finalHeight = desiredHeight;
      } else {
        if (spaceBelow >= spaceAbove) {
          placeAbove = false;
          finalHeight = Math.max(20, Math.floor(spaceBelow));
        } else {
          placeAbove = true;
          finalHeight = Math.max(20, Math.floor(spaceAbove));
        }
      }

      canvas.width = this.dropDownWidth || this.offsetWidth;
      canvas.height = finalHeight;
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = finalHeight + 'px';

      const patch = this.shadowRoot.getElementById('patch');
      patch.style.width = Math.min(parseInt(this._styles.width), canvas.width) + 'px';
      if (placeAbove) {
        canvas.style.top = 'auto';
        canvas.style.bottom = '100%';
        canvas.style.borderRadius = '4px 4px 0 0';
        patch.style.top = '-1px';
      } else {
        canvas.style.top = '100%';
        canvas.style.bottom = 'auto';
        canvas.style.borderRadius = '0 0 4px 4px';
        patch.style.top = '100%';
      }

      this._renderCanvas();
    }
  }

  _renderCanvas() {
    const canvas = this.shadowRoot.querySelector('canvas');

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;

    // Clear canvas
    ctx.fillStyle = this._styles.backgroundColor || 'white';
    ctx.fillRect(0, 0, width, height);

    // Determine visible range of items
    const startIndex = Math.floor(this._scrollOffset / this._itemHeight);
    const endIndex = Math.min(startIndex + this.visibleItems + 1, this._items.length);

    // Draw only visible items
    ctx.font = `${this._styles.fontSize || '14px'} ${this._styles.fontFamily || 'Arial, sans-serif'}`;
    ctx.textBaseline = 'middle';
    for (let i = startIndex; i < endIndex; i++) {
      // Check if the item is within the visible area
      const y = i * this._itemHeight - this._scrollOffset;
      if (y + this._itemHeight < 0 || y > height) continue;

      // Colors for the selected item
      if (i === this._selectedIndex) {
        ctx.fillStyle = 'royalblue';
        ctx.fillRect(0, y, width, this._itemHeight - 1);

        ctx.fillStyle = 'white';
      } else {
        ctx.fillStyle = this._styles.color;
      }

      const cancel = !this.dispatchEvent(new CustomEvent('paint', {
        cancelable: true,
        detail: {
          index: i,
          value: this._items[i],
          canvas: ctx,
          box: { y, width, height: this._itemHeight }
        }
      }));

      if (!cancel) {
        const item = this._items[i].toString();

        // Truncate long text
        const maxWidth = width - 8;
        let displayText = item;
        if (ctx.measureText(displayText).width > maxWidth) {
          // Cut roughly
          while (displayText.length > 100 && ctx.measureText(displayText).width > maxWidth) {
            displayText = displayText.slice(0, -50);
          }
          if (displayText.length < item.length) {
            displayText += item.slice(displayText.length, displayText.length + 50);
          }
          // Then precisely
          do {
            displayText = displayText.slice(0, -1);
          } while (displayText.length > 1 && ctx.measureText(displayText + '...').width > maxWidth)
          displayText += '...';
        }

        ctx.fillText(displayText, 6, y + this._itemHeight / 2);
      }

      // Separator
      ctx.strokeStyle = '#ddd';
      ctx.beginPath();
      ctx.moveTo(0, y + this._itemHeight - 0.5);
      ctx.lineTo(width, y + this._itemHeight - 0.5);
      ctx.stroke();
    }

    // Scrollbar indicator
    if (this._items.length > this.visibleItems) {
      const maxScroll = this.visibleItems < this._items.length
        ? this._itemHeight * (this._items.length - this.visibleItems)
        : 0;

      // Compute thumb height and clamp to minimum to avoid too-short thumb
      const scrollbarHeight = Math.max(
        this._minScrollbarHeight,
        height * Math.min(1, this.visibleItems / this._items.length)
      );

      // Position the thumb within track, taking into account clamped height
      const scrollbarY = maxScroll === 0
        ? 0
        : this._scrollOffset / maxScroll * (height - scrollbarHeight);

      // Store scrollbar metrics for interaction
      this._scrollbar.x = width - 6;
      this._scrollbar.y = scrollbarY;
      this._scrollbar.width = 6;
      this._scrollbar.height = scrollbarHeight;

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(this._scrollbar.x, scrollbarY, 4, scrollbarHeight);
    }
  }

  ensureVisible(index) {
    if (index < 0 || index >= this._items.length) return;

    const itemTop = index * this._itemHeight;

    if (this._scrollOffset > itemTop) {
      this._scrollOffset = itemTop;
    } else {
      const visibleHeight = this.visibleItems * this._itemHeight;
      const itemBottom = itemTop + this._itemHeight;
      if (this._scrollOffset + visibleHeight < itemBottom) {
        this._scrollOffset = itemBottom - visibleHeight;
      }
    }

    if (this.isOpen) this._renderCanvas();
  }

  get items() {
    return this._items;
  }

  set items(value) {
    this._items = value;
    this.selectedIndex = this._selectedIndex;
  }

  get selectedIndex() {
    return this._selectedIndex;
  }

  set selectedIndex(value) {
    if (value >= 0 && value < this._items.length) {
      this._selectedIndex = value;
    } else {
      this._selectedIndex = -1;
    }
    this._lastSelectedIndex = this._selectedIndex;
    this.render();
  }

  get selectedValue() {
    return this._selectedIndex < 0 ? null : this._items[this._selectedIndex];
  }

  set selectedValue(value) {
    this.selectedIndex = this._items.indexOf(value);
  }

  get placeholder() {
    return this._placeholder;
  }

  set placeholder(value) {
    value = value?.toString() || '';
    if (value === this._placeholder) return;
    this._placeholder = value;
    this.setAttribute('placeholder', value);
    this.render();
  }

  get disabled() {
    return this._disabled;
  }

  set disabled(value) {
    value = Boolean(value);
    if (value === this._disabled) return;
    this._disabled = value;
    if (value) {
      this.setAttribute('disabled', '');
      this.setAttribute('tabindex', '-1');
    } else {
      this.removeAttribute('disabled');
      this.setAttribute('tabindex', '0');
    }
    this.render();
  }
}

// Register the web component
customElements.define('virtual-select', VirtualSelect);
