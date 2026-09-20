targetScope = 'subscription'

@description('Azure region for all deployment resources.')
param location string = 'eastasia'

@description('Existing resource group that hosts the web application.')
param appResourceGroupName string = 'fpl-formula-rg'

@description('Deployment environment used to generate deterministic resource names.')
param environmentName string = 'production'

@description('Repository component of the GitHub OIDC subject claim.')
param githubRepository string = 'dominic-lcw@42367021/fpl-formula@1350268343'

@description('GitHub Actions environment used by the deployment job.')
param githubEnvironment string = 'production'

@description('Administrator password for the PostgreSQL flexible server.')
@secure()
param postgresAdminPassword string = uniqueString(subscription().id, appResourceGroupName, 'fpl-postgres-admin')

var resourceToken = toLower(uniqueString(subscription().id, location, environmentName))
var cicdResourceGroupName = 'azrg${resourceToken}'
var tags = {
  environment: environmentName
  project: 'fpl-formula'
}

resource appResourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01-preview' existing = {
  name: appResourceGroupName
}

resource cicdResourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01-preview' = {
  name: cicdResourceGroupName
  location: location
  tags: tags
}

module postgres './modules/postgresql.bicep' = {
  name: 'azdeppg${resourceToken}'
  scope: appResourceGroup
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    administratorLoginPassword: postgresAdminPassword
  }
}

module appService './modules/app-service.bicep' = {
  name: 'azdepapp${resourceToken}'
  scope: appResourceGroup
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    databaseUrl: postgres.outputs.connectionString
  }
}

module pipelineIdentity './modules/pipeline-identity.bicep' = {
  name: 'azdeppip${resourceToken}'
  scope: cicdResourceGroup
  params: {
    githubEnvironment: githubEnvironment
    githubRepository: githubRepository
    location: location
    resourceToken: resourceToken
    tags: tags
  }
}

module pipelineRoles './modules/pipeline-roles.bicep' = {
  name: 'azdeprole${resourceToken}'
  scope: appResourceGroup
  params: {
    pipelinePrincipalId: pipelineIdentity.outputs.principalId
    webAppName: appService.outputs.webAppName
  }
}

output webAppName string = appService.outputs.webAppName
output webAppUrl string = appService.outputs.webAppUrl
output postgresServerName string = postgres.outputs.serverName
output postgresFqdn string = postgres.outputs.serverFqdn
output databaseName string = postgres.outputs.databaseName
output resourceGroupName string = appResourceGroup.name
output cicdResourceGroupName string = cicdResourceGroup.name
output pipelineClientId string = pipelineIdentity.outputs.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
