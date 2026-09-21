# GitHub Actions deployment setup

The Azure infrastructure creates a user-assigned managed identity with a federated credential for the `production` GitHub Actions environment. This lets the workflow sign in to Azure without storing a password, client secret, or App Service publish profile in GitHub.

The federated credential uses the subject claim emitted by this repository's GitHub Enterprise Managed User setup. If GitHub displays a different subject value in a future Azure login failure, update the `githubRepository` parameter in `infra/main.parameters.json` to the repository component of that claim.

## Initial setup

1. Provision `infra/main.bicep` with an Azure identity that can create resources in the subscription. The deployment outputs include `webAppName`, `pipelineClientId`, `tenantId`, and `subscriptionId`.
2. Create the GitHub `production` environment without required reviewers, so merges to `main` deploy automatically:

   ```bash
   gh api --method PUT "repos/dominic-lcw/fpl-formula/environments/production"
   ```

3. Add these repository variables from the Bicep deployment output:

   ```bash
   gh variable set AZURE_CLIENT_ID --body "<pipelineClientId>" --repo dominic-lcw/fpl-formula
   gh variable set AZURE_TENANT_ID --body "<tenantId>" --repo dominic-lcw/fpl-formula
   gh variable set AZURE_SUBSCRIPTION_ID --body "<subscriptionId>" --repo dominic-lcw/fpl-formula
   gh variable set AZURE_RESOURCE_GROUP --body "fpl-formula-rg" --repo dominic-lcw/fpl-formula
   gh variable set AZURE_WEBAPP_NAME --body "<webAppName>" --repo dominic-lcw/fpl-formula
   ```

4. Add the PostgreSQL connection string as a repository secret. After provisioning, build it from the Bicep outputs:

   ```bash
   gh secret set DATABASE_URL --body "postgresql://fpladmin:<password>@<postgresFqdn>:5432/fplformula?sslmode=require" --repo dominic-lcw/fpl-formula
   ```

   App Service receives the same connection string from Bicep. GitHub Actions needs the secret so `pnpm migrate` and `pnpm hydrate` can update the live database during deploy.

## Normal release flow

- Merge a pull request into `main`.
- The `Deploy FPL Formula` workflow runs tests and linting, migrates the PostgreSQL schema, hydrates FPL data into PostgreSQL, fetches BBC manager press quotes, builds the Node.js package, and ZIP-deploys it.
- App Service restarts and serves rankings, forecasts, and bookings from PostgreSQL.

The infrastructure workflow is intentionally manual (`workflow_dispatch`) because it can change Azure resources. Run it only after reviewing an infrastructure change.
