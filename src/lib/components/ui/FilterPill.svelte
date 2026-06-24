<!--
  FilterPill Component - Reusable filter pill for Intelligent Filter System

  Phase 2 of Intelligent Filter System (27-40h total)

  Features:
  - Three states: active, available, disabled (transparency principle)
  - Count badge showing result numbers (before selection)
  - Tooltip support for descriptions
  - Design system integration (FILTER_STATES)
  - Full accessibility (ARIA, keyboard, screen readers)
  - Responsive (mobile, tablet, desktop)

  Usage:
  <FilterPill
    label="Volleyball"
    count={1234}
    state="available"
    description="Volleyball action photos"
    onclick={handleClick}
  />
-->

<script lang="ts">
  type FilterPillState = 'active' | 'available' | 'disabled';

  interface Props {
    label: string;
    count?: number;
    state?: FilterPillState;
    description?: string;
    icon?: any; // Lucide icon component
    onclick?: (event: MouseEvent) => void;
    size?: 'sm' | 'md' | 'lg';
  }

  let {
    label,
    count,
    state = 'available',
    description,
    icon,
    onclick,
    size = 'md'
  }: Props = $props();

  // Visual treatment now comes from the shared elevated `.chip` / `.chip-active`
  // classes (app.css). Only size tokens remain component-local.

  // Ensure minimum 44px touch targets for accessibility
  const sizeStyles = {
    sm: {
      padding: 'px-3 py-2 min-h-[44px]',
      text: 'text-xs',
      icon: 'w-3 h-3',
      badge: 'text-[10px] ml-1'
    },
    md: {
      padding: 'px-4 py-2.5 min-h-[44px]',
      text: 'text-sm',
      icon: 'w-3.5 h-3.5',
      badge: 'text-xs ml-1.5'
    },
    lg: {
      padding: 'px-5 py-3 min-h-[44px]',
      text: 'text-base',
      icon: 'w-4 h-4',
      badge: 'text-sm ml-2'
    }
  };

  const sizes = $derived(sizeStyles[size]);

  function handleClick(event: MouseEvent): void {
    // Stop propagation to prevent closing dropdowns (coding standards)
    event.stopPropagation();

    // Don't trigger onclick if disabled
    if (state === 'disabled') {
      return;
    }

    onclick?.(event);
  }
</script>

<!-- PERFORMANCE: CSS animation instead of svelte-motion -->
<button
  onclick={handleClick}
  class="
    filter-pill-animate group font-medium chip
    {sizes.padding}
    {sizes.text}
    {state === 'active' ? 'chip-active' : ''}
    {state === 'disabled' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
  "
    aria-pressed={state === 'active'}
    aria-disabled={state === 'disabled'}
    disabled={state === 'disabled'}
    title={description || ''}
  >
      <!-- Optional icon -->
      {#if icon}
        {@const IconComponent = icon}
        <IconComponent
          class="
            {sizes.icon}
            {state === 'active' ? 'text-charcoal-950' : 'text-charcoal-400 group-hover:text-charcoal-200'}
            {state === 'disabled' ? 'text-charcoal-700' : ''}
            transition-colors duration-200
          "
        />
      {/if}

      <!-- Label -->
      <span class="font-medium">{label}</span>

      <!-- Count badge (transparency principle: show before selection) -->
      {#if count !== undefined}
        <span class="chip-count">{count.toLocaleString()}</span>
      {/if}
</button>

<style>
  /* PERFORMANCE: CSS animation instead of svelte-motion */
  @keyframes filter-pill-appear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .filter-pill-animate {
    animation: filter-pill-appear 0.2s ease-out forwards;
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
    .filter-pill-animate {
      animation: none;
    }
  }

  /* Disabled state styling (ensure no pointer events) */
  button:disabled {
    pointer-events: none;
  }

  /* Focus visible for keyboard navigation */
  button:focus-visible {
    outline: 2px solid theme('colors.gold.500');
    outline-offset: 2px;
  }
</style>
