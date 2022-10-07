import * as vscode from 'vscode'
import * as _ from 'lodash'
import defaultConf from './DefaultConf'

const ProjectName = 'noveler'

class Config {
	public update = (extension = ProjectName) => {
		this.value = vscode.workspace.getConfiguration().get(extension) as IConfig
		return this.value
	}
	private _value: IConfig = this.update()
	public get value() {
		return this._value
	}
	private set value(value) {
		this._value = value
	}
	public constructor(extension = ProjectName) {
		this.update(extension)
		if (_.isEmpty(this.value)) {
			vscode.workspace.getConfiguration().update(extension, defaultConf, vscode.ConfigurationTarget.Workspace)
			this.value = defaultConf
			vscode.workspace.getConfiguration().update("editor.wrappingIndent", "none", vscode.ConfigurationTarget.Workspace)
			vscode.workspace.getConfiguration().update("editor.autoIndent", "none", vscode.ConfigurationTarget.Workspace)
		}
	}
}

export default new Config(ProjectName)
