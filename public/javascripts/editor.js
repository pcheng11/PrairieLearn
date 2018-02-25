$(document)
  .one("focus.autoExpand", "textarea.autoExpand", function() {
    var savedValue = this.value;
    this.value = "";
    this.baseScrollHeight = this.scrollHeight;
    this.value = savedValue;
  })
  .on("input.autoExpand", "textarea.autoExpand", function() {
    var minRows = this.getAttribute("data-min-rows") | 0,
      rows;
    this.rows = minRows;
    rows = Math.ceil((this.scrollHeight - this.baseScrollHeight) / 16);
    this.rows = minRows + rows;
  });

function update(editor) {
  var question_content = document.getElementById('updated_question_content')
  var content_in_editor = editor.session.getValue();
  question_content.value = content_in_editor;
}