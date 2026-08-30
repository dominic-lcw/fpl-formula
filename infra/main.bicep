targetScope = 'subscription'

@description('Azure region for all deployment resources.')
param location string = 'eastasia'

@description('Existing resource group that hosts the web application.')
param appResourceGroupName string = 'fpl-formula-rg'

@description('Deployment environment used to generate deterministic resource names.')
param environmentName string = 'production'

@description('GitHub repository authorized to deploy the application, in owner/repository format.')
param githubRepository string = 'dominic-lcw/fpl-formula'

@description('GitHub Actions environment used by the deployment job.')
param githubEnvironment string = 'production'

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

module appService './modules/app-service.bicep' = {
  name: 'azdepapp${resourceToken}'
  scope: appResourceGroup
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
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
output resourceGroupName string = appResourceGroup.name
output cicdResourceGroupName string = cicdResourceGroup.name
output pipelineClientId string = pipelineIdentity.outputs.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
