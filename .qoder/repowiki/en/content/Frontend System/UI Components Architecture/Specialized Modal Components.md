# Specialized Modal Components

<cite>
**Referenced Files in This Document**
- [CombatModal.tsx](file://web/src/ui/CombatModal.tsx)
- [QAPrompt.tsx](file://web/src/ui/QAPrompt.tsx)
- [Game.tsx](file://web/src/ui/Game.tsx)
- [store.ts](file://web/src/state/store.ts)
- [engine.ts](file://server/src/game/engine.ts)
- [combat.ts](file://server/src/game/combat.ts)
- [types.ts](file://shared/src/types.ts)
- [protocol.ts](file://shared/src/protocol.ts)
- [styles.css](file://web/src/styles.css)
- [socket.ts](file://web/src/net/socket.ts)
- [handlers.ts](file://server/src/net/handlers.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document provides comprehensive technical documentation for the specialized modal components in the missile flight chess game. It focuses on two key modal interfaces:
- **CombatModal**: Handles tactical combat resolution for AAM/SAM/ARM combat scenarios, presenting choices and displaying outcomes
- **QAPrompt**: Manages educational question-and-answer challenges with interactive selection and scoring mechanisms

The documentation covers component architecture, lifecycle management, overlay handling, focus management, integration with game state, animation systems, accessibility features, and state synchronization with the game engine.

## Project Structure
The modal components are part of the web UI layer and integrate with the shared game types and server-side engine. The key files involved are:

```mermaid
graph TB
subgraph "Web UI Layer"
GameComp["Game.tsx"]
CombatModal["CombatModal.tsx"]
QAPrompt["QAPrompt.tsx"]
Store["store.ts"]
Styles["styles.css"]
Socket["socket.ts"]
end
subgraph "Shared Types"
Types["types.ts"]
Protocol["protocol.ts"]
end
subgraph "Server Engine"
Engine["engine.ts"]
CombatRes["combat.ts"]
Handlers["handlers.ts"]
end
GameComp --> CombatModal
GameComp --> QAPrompt
CombatModal --> Store
QAPrompt --> Store
Store --> Socket
Store --> Engine
Engine --> Handlers
Engine --> CombatRes
Types --> Engine
Protocol --> Handlers
Styles --> GameComp
```

**Diagram sources**
- [Game.tsx:10-33](file://web/src/ui/Game.tsx#L10-L33)
- [CombatModal.tsx:1-32](file://web/src/ui/CombatModal.tsx#L1-L32)
- [QAPrompt.tsx:1-45](file://web/src/ui/QAPrompt.tsx#L1-L45)
- [store.ts:1-164](file://web/src/state/store.ts#L1-L164)
- [engine.ts:1-920](file://server/src/game/engine.ts#L1-L920)
- [combat.ts:1-33](file://server/src/game/combat.ts#L1-L33)
- [types.ts:140-146](file://shared/src/types.ts#L140-L146)
- [protocol.ts:55-64](file://shared/src/protocol.ts#L55-L64)
- [handlers.ts:126-142](file://server/src/net/handlers.ts#L126-L142)

**Section sources**
- [Game.tsx:10-33](file://web/src/ui/Game.tsx#L10-L33)
- [CombatModal.tsx:1-32](file://web/src/ui/CombatModal.tsx#L1-L32)
- [QAPrompt.tsx:1-45](file://web/src/ui/QAPrompt.tsx#L1-L45)
- [store.ts:1-164](file://web/src/state/store.ts#L1-L164)

## Core Components
This section documents the two specialized modal components and their roles in the game flow.

### CombatModal Component
The CombatModal presents tactical combat choices during AAM/SAM/ARM encounters. It receives a combat prompt from the game state and renders available options for the current player.

Key characteristics:
- Receives a combat prompt containing description and selectable options
- Provides primary action buttons for combat decisions
- Integrates with the store's combat response handler
- Uses modal overlay styling for focus and isolation

Implementation highlights:
- Uses the store's combatRespond action to submit choices
- Renders options as primary buttons with click handlers
- Displays combat description text for context

**Section sources**
- [CombatModal.tsx:9-31](file://web/src/ui/CombatModal.tsx#L9-L31)
- [store.ts:49-50](file://web/src/state/store.ts#L49-L50)

### QAPrompt Component
The QAPrompt manages educational question-and-answer challenges. It presents questions, handles user selection, validates answers, and submits responses to the server.

Key characteristics:
- Presents question text and multiple-choice options
- Uses radio button selection with visual feedback
- Validates submission to prevent empty answers
- Integrates with the store's QA answer handler

Implementation highlights:
- Maintains local selection state using React hooks
- Disables submit button until a selection is made
- Submits answer using the store's qaAnswer action

**Section sources**
- [QAPrompt.tsx:9-44](file://web/src/ui/QAPrompt.tsx#L9-L44)
- [store.ts:50](file://web/src/state/store.ts#L50)

## Architecture Overview
The modal components operate within a client-server architecture with strict separation of concerns:

```mermaid
sequenceDiagram
participant Client as "Client UI"
participant GameUI as "Game.tsx"
participant Modal as "Modal Component"
participant Store as "store.ts"
participant Socket as "socket.ts"
participant Server as "engine.ts"
participant Handlers as "handlers.ts"
Client->>GameUI : Render game with prompts
GameUI->>GameUI : Check myPrompt()
alt Combat prompt
GameUI->>Modal : Render CombatModal
Modal->>Store : combatRespond(id, choice)
Store->>Socket : emit C2S.CombatRespond
Socket->>Handlers : C2S.CombatRespond
Handlers->>Server : engine.combatRespond()
Server->>Server : Resolve combat outcome
Server-->>Handlers : Updated state
Handlers-->>Socket : S2C.GameState
Socket-->>Store : GameState update
Store-->>GameUI : State change
GameUI-->>Client : Hide modal
else QA prompt
GameUI->>Modal : Render QAPrompt
Modal->>Store : qaAnswer(questionId, answerIndex)
Store->>Socket : emit C2S.QAAnswer
Socket->>Handlers : C2S.QAAnswer
Handlers->>Server : engine.qaAnswer()
Server->>Server : Evaluate answer correctness
Server-->>Handlers : Updated state
Handlers-->>Socket : S2C.GameState
Socket-->>Store : GameState update
Store-->>GameUI : State change
GameUI-->>Client : Hide modal
end
```

**Diagram sources**
- [Game.tsx:29-30](file://web/src/ui/Game.tsx#L29-L30)
- [store.ts:133-138](file://web/src/state/store.ts#L133-L138)
- [handlers.ts:126-142](file://server/src/net/handlers.ts#L126-L142)
- [engine.ts:435-522](file://server/src/game/engine.ts#L435-L522)
- [engine.ts:568-584](file://server/src/game/engine.ts#L568-L584)

## Detailed Component Analysis

### CombatModal Analysis
The CombatModal component handles tactical combat resolution with the following structure:

```mermaid
classDiagram
class CombatModal {
+Props props
+render() JSX.Element
-useStore combatRespond
-prompt Prompt
}
class Store {
+combatRespond(combatId, choice, data) void
+myPrompt() Prompt | null
}
class Prompt {
+kind "combat"
+combatId string
+description string
+options string[]
+seat Color
}
class Engine {
+combatRespond(seat, combatId, choice, data) void
+openAamPrompt(...) void
}
CombatModal --> Store : "uses"
CombatModal --> Prompt : "renders"
Store --> Engine : "emits"
```

**Diagram sources**
- [CombatModal.tsx:5-7](file://web/src/ui/CombatModal.tsx#L5-L7)
- [store.ts:49](file://web/src/state/store.ts#L49)
- [types.ts:145](file://shared/src/types.ts#L145)
- [engine.ts:416-433](file://server/src/game/engine.ts#L416-L433)

#### Combat Resolution Flow
The combat resolution follows a deterministic sequence:

```mermaid
flowchart TD
Start([Combat Initiated]) --> CheckAAM{"Has AAM?"}
CheckAAM --> |Yes| OfferFire["Offer AAM launch"]
CheckAAM --> |No| PlainCollision["Apply plain collision"]
OfferFire --> Choice{"Player chooses"}
Choice --> |Fire| SpendAAM["Spend AAM missile"]
Choice --> |Skip| PlainCollision
SpendAAM --> Duel["AAM duel resolution"]
Duel --> Outcome{"Outcome"}
Outcome --> |Attacker wins| DefenderReturns["Defender returns to hangar"]
Outcome --> |Defender wins| CounterAttack["Defender counter-attack"]
Outcome --> |Tie| BothStay["Both planes stay"]
CounterAttack --> CounterOutcome{"Counter outcome"}
CounterOutcome --> |Defender wins| AttackerReturns["Attacker returns to hangar"]
CounterOutcome --> |Attacker wins| BothStay
CounterOutcome --> |Tie| BothStay
PlainCollision --> ApplyCollision["Apply collision effects"]
DefenderReturns --> ApplyCollision
AttackerReturns --> ApplyCollision
BothStay --> ApplyCollision
ApplyCollision --> End([Combat Resolved])
```

**Diagram sources**
- [engine.ts:416-522](file://server/src/game/engine.ts#L416-L522)
- [combat.ts:14-20](file://server/src/game/combat.ts#L14-L20)

**Section sources**
- [CombatModal.tsx:9-31](file://web/src/ui/CombatModal.tsx#L9-L31)
- [engine.ts:416-522](file://server/src/game/engine.ts#L416-L522)
- [combat.ts:14-20](file://server/src/game/combat.ts#L14-L20)

### QAPrompt Analysis
The QAPrompt component manages educational challenges with the following structure:

```mermaid
classDiagram
class QAPrompt {
+Props props
+useState selection
+handleSubmit() void
+render() JSX.Element
}
class Store {
+qaAnswer(questionId, answerIndex) void
+myPrompt() Prompt | null
}
class Prompt {
+kind "qa"
+questionId string
+prompt string
+options string[]
+seat Color
}
class Engine {
+qaAnswer(seat, questionId, answerIndex) void
+openLibrary(seat) void
}
QAPrompt --> Store : "uses"
QAPrompt --> Prompt : "renders"
Store --> Engine : "emits"
```

**Diagram sources**
- [QAPrompt.tsx:5-7](file://web/src/ui/QAPrompt.tsx#L5-L7)
- [store.ts:50](file://web/src/state/store.ts#L50)
- [types.ts:146](file://shared/src/types.ts#L146)
- [engine.ts:556-566](file://server/src/game/engine.ts#L556-L566)

#### QA Challenge Flow
The question-and-answer challenge follows this process:

```mermaid
sequenceDiagram
participant Player as "Player"
participant QAPrompt as "QAPrompt"
participant Store as "store.ts"
participant Server as "engine.ts"
Player->>QAPrompt : View question
Player->>QAPrompt : Select answer
QAPrompt->>QAPrompt : Validate selection
alt Valid selection
QAPrompt->>Store : qaAnswer(questionId, answerIndex)
Store->>Server : C2S.QAAnswer
Server->>Server : Verify answer correctness
alt Correct answer
Server->>Server : Draw reward card
Server-->>Player : Reward effect
else Incorrect answer
Server->>Server : Draw punishment card
Server-->>Player : Punishment effect
end
Server-->>Player : Clear prompt
else Invalid selection
QAPrompt->>Player : Disable submit button
end
```

**Diagram sources**
- [QAPrompt.tsx:13-16](file://web/src/ui/QAPrompt.tsx#L13-L16)
- [store.ts:136-138](file://web/src/state/store.ts#L136-L138)
- [engine.ts:568-584](file://server/src/game/engine.ts#L568-L584)

**Section sources**
- [QAPrompt.tsx:9-44](file://web/src/ui/QAPrompt.tsx#L9-L44)
- [engine.ts:556-584](file://server/src/game/engine.ts#L556-L584)

### Modal Lifecycle Management
The modal lifecycle is managed through the game state and store integration:

```mermaid
stateDiagram-v2
[*] --> Idle
Idle --> PromptActive : "myPrompt() returns prompt"
PromptActive --> ModalVisible : "Render modal component"
ModalVisible --> Processing : "User submits choice"
Processing --> StateUpdate : "Server processes response"
StateUpdate --> Idle : "Clear prompt from state"
ModalVisible --> Idle : "User closes modal"
Processing --> Error : "Invalid input or server error"
Error --> Idle : "Show error toast"
```

**Diagram sources**
- [Game.tsx:13-30](file://web/src/ui/Game.tsx#L13-L30)
- [store.ts:157-161](file://web/src/state/store.ts#L157-L161)

**Section sources**
- [Game.tsx:10-33](file://web/src/ui/Game.tsx#L10-L33)
- [store.ts:157-161](file://web/src/state/store.ts#L157-L161)

## Dependency Analysis
The modal components depend on several layers of the application architecture:

```mermaid
graph TB
subgraph "UI Dependencies"
CombatModal --> Store
QAPrompt --> Store
Store --> Socket
Socket --> Handlers
end
subgraph "Game Logic"
Engine --> CombatRes
Engine --> Types
Engine --> Protocol
end
subgraph "Shared Contracts"
Types --> Protocol
Protocol --> Handlers
Protocol --> Engine
end
Store --> Engine
Handlers --> Engine
Engine --> Types
```

**Diagram sources**
- [store.ts:8](file://web/src/state/store.ts#L8)
- [handlers.ts:4-13](file://server/src/net/handlers.ts#L4-L13)
- [engine.ts:18-32](file://server/src/game/engine.ts#L18-L32)
- [types.ts:140-146](file://shared/src/types.ts#L140-L146)
- [protocol.ts:55-64](file://shared/src/protocol.ts#L55-L64)

**Section sources**
- [store.ts:8](file://web/src/state/store.ts#L8)
- [handlers.ts:4-13](file://server/src/net/handlers.ts#L4-L13)
- [engine.ts:18-32](file://server/src/game/engine.ts#L18-L32)

## Performance Considerations
- **Minimal re-renders**: Both modals use focused rendering based on prompt presence, avoiding unnecessary updates
- **Local state management**: QAPrompt maintains minimal local state for selections, reducing prop drilling
- **Efficient event handling**: Modal components delegate all state changes to the centralized store
- **Animation optimization**: CSS animations use transform properties for GPU acceleration

## Troubleshooting Guide
Common issues and solutions:

### Modal Not Appearing
- **Cause**: No active prompt in game state
- **Solution**: Verify `myPrompt()` returns a prompt object for the current player's seat
- **Debug**: Check store state for `prompts` array and `state.turn`

### Combat Options Not Responding
- **Cause**: Invalid combat ID or seat mismatch
- **Solution**: Ensure combatId matches the pending combat and seat belongs to current player
- **Debug**: Verify engine state for `pendingCombat` field

### QA Submission Disabled
- **Cause**: No selection made or invalid answer index
- **Solution**: Ensure radio button selection is valid and within bounds
- **Debug**: Check answerIndex range and selection state

**Section sources**
- [engine.ts:435-522](file://server/src/game/engine.ts#L435-L522)
- [engine.ts:568-584](file://server/src/game/engine.ts#L568-L584)
- [QAPrompt.tsx:13-16](file://web/src/ui/QAPrompt.tsx#L13-L16)

## Conclusion
The specialized modal components provide robust, accessible interfaces for tactical combat and educational challenges in the missile flight chess game. Their architecture ensures clean separation of concerns, reliable state synchronization, and responsive user interactions. The components integrate seamlessly with the game engine while maintaining performance and accessibility standards.

The design supports future enhancements such as additional combat types, expanded question categories, and improved accessibility features without disrupting existing functionality.