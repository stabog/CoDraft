export function workingCopyEqualsBase(baseTitle, baseContent, title, content) {
  return baseTitle === title && baseContent === content
}

export function hasWorkingChanges(baseTitle, baseContent, title, content) {
  return !workingCopyEqualsBase(baseTitle, baseContent, title, content)
}
