# SiloOS System Context

## Project Overview
**SiloOS** is a specialized adaptation of the TopBrewer coffee control software, repurposed to control an **Industrial Green Coffee Silo System**.

## Key Concepts & Deviations

### 1. Unit Mapping (The "1ml = 1kg" Rule)
The underlying coffee machine firmware and protocol expect units in "ml" (volume) for liquid dispensing. However, in this industrial context:
*   **App UI "ml"** = **Physical "kg"**
*   **App UI "1.0"** = **1.0 kg** on the scale.

**CRITICAL Rule**: The system is 1:1 mapped.
*   Input of `200` in UI → Target of `200 kg` on Scale.
*   **DO NOT** apply standard water density conversions (1g = 1ml).
*   **DO NOT** divide by 1000. 1 Unit = 1 Kg.

### 2. Gravimetric Dosing
The system uses a custom `DoseController` to manage the large-scale dispensing.
*   **Predictive Stop**: Uses flow rate learning to close valves early (accounting for "in-flight" material).
*   **Auto-Correction**: If a dispense falls short, the system calculates the missing weight and sends a **scaled top-up order** to fetch the remainder.
    *   **Scaled Top-Up**: The recipe is proportionally reduced. If 10% of weight is missing, 10% of every ingredient is requested.

### 3. Protocol
We communicate with the Silo Controller using the standard `SFWU` (Scanomat Firmware Update) protocol, masquerading as a coffee machine.
*   **Ingredients**: Mapped to Silos.
*   **Recipes**: Mapped to Silo blends/outputs.
