|   property/method        |        type          |
|--------------------------|:--------------------:|
| items                    | string[] or object[] |
| placeholder  [prop/attr] |      string          |
| disabled     [prop/attr] |      boolean         |
| visibleItems             |      number          |
| dropDownWidth            |      number          |
| selectedIndex            |      number          |
| selectedValue            |  string or object    |
| isOpen        [readonly] |      boolean         |
|                          |                      |
| showDropDown()           |      function        |
| closeDropDown()          |      function        |
| toggleDropDown()         |      function        |
| render()                 |      function        |
| ensureVisible(index)     |      function        |

### Events
- beforeopen
- beforechange `{cancelable: true, detail: { index }}`
- change
- paint `{detail: {index, value, canvas, box: { y, width, height }}}`
