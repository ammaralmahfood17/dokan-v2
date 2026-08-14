# Contributing to Dokan v2

First off, thank you for considering contributing to Dokan! It's a professional-grade POS and QR-menu platform, and we maintain a high bar for code quality to ensure production stability.

## 🛠 Development Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/ammaralmahfood17/dokan-v2.git
   cd dokan-v2
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Copy `.env.example` to `.env.local` and fill in your Supabase credentials.

4. **Database Setup:**
   Apply migrations to your Supabase project:
   ```bash
   npx supabase db push
   ```

5. **Run Development Server:**
   ```bash
   npm run dev
   ```

## 📏 Quality Standards

We follow the **Karpathy Guidelines** (see `AGENTS.md`):
- **Simplicity First:** No over-engineering.
- **Surgical Changes:** Touch only what is necessary.
- **Goal-Driven:** Every PR must be backed by a verifiable goal.

### Coding Conventions
- **TypeScript:** Strict mode. Zero `any`.
- **RTL/Arabic:** Use logical properties (`ms-`, `me-`, `start-`, `end-`). Never use `ml-` or `mr-`.
- **iOS PWA:** No `window.confirm()`. Use the `<Modal>` component.
- **Styling:** Tailwind CSS. Match existing design tokens.

## 🧪 Testing Requirement

No PR will be merged without verification:
- **Unit Tests:** Run `npm run test` (Vitest).
- **E2E Tests:** Run `npx playwright test`.
- **Build Check:** Ensure `npm run build` passes without errors.

## 🚀 Submission Process

1. **Fork** the repository.
2. Create a **feature branch** (`git checkout -b feat/your-feature`).
3. Commit your changes with clear, descriptive messages.
4. Push to your fork and submit a **Pull Request**.
5. Describe the change, the "why", and how you verified it.

---
*Happy coding! Let's build the best POS for the GCC market.*
