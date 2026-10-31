/** The saved project list is damaged as a whole (not JSON, or not a list), so none of its projects can be read. */
export class DamagedProjectList extends Error {
  constructor() {
    super('The saved list of projects is damaged and can\'t be read. Reset the app to start again: it also deletes the API keys saved for them.');
  }
}
